"""Automatic opening of reporting periods.

Weeks run Monday to Sunday. A week belongs to the month (and quarter, and
year) its Monday falls in, so a month holds 4 or 5 weeks and every week is
counted exactly once. When a new week starts, this makes sure the week, its
month, its quarter and its year all exist and are OPEN.

Nothing here runs on a timer by itself (the free Render server sleeps), so it
is called from three places:
  * PeriodAutoOpenMiddleware, at most once every 30 minutes per server process
  * the secret ping URL handled by that middleware (cron-job.org / GitHub)
  * the `open_periods` management command
All three are safe to repeat: existing periods are never duplicated.
"""
import logging
import time
from datetime import date, datetime, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction

logger = logging.getLogger(__name__)

_THROTTLE_SECONDS = 30 * 60
_last_check = 0.0


def local_today():
    """Today's date in the organisation's timezone (Africa/Lagos unless
    PERIODS_TIMEZONE says otherwise), not the server's UTC date."""
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(getattr(settings, "PERIODS_TIMEZONE", "Africa/Lagos"))
        return datetime.now(tz).date()
    except Exception:
        return date.today()


def monday_of(d):
    return d - timedelta(days=d.weekday())


def _ensure(period_type, lookup_date, build_date=None):
    """Return (period, created). The period containing lookup_date, created
    OPEN if missing (built from build_date, default lookup_date), and moved
    from DRAFT to OPEN if it was sitting as a draft."""
    from apps.imports.importer import _build_period_fields
    from apps.periods.models import ReportingPeriod

    period = ReportingPeriod.objects.filter(
        period_type=period_type, start_date__lte=lookup_date, end_date__gte=lookup_date
    ).first()
    if period is not None:
        if period.status == "DRAFT":
            period.status = "OPEN"
            period.save(update_fields=["status"])
        return period, False
    fields = _build_period_fields(period_type, build_date or lookup_date)
    # An existing period may carry odd dates (imported sheets) so the date
    # lookup above missed it, yet it already owns this year/month/quarter slot
    # under a unique constraint. Reuse it instead of inserting a duplicate.
    slot = {"period_type": period_type, "reporting_year": fields.get("reporting_year")}
    if period_type == "MONTHLY":
        slot["month"] = fields.get("month")
    elif period_type == "QUARTERLY":
        slot["quarter"] = fields.get("quarter")
    elif period_type == "WEEKLY":
        slot["week_number"] = fields.get("week_number")
    if period_type != "WEEKLY":  # weeks are matched by date above; month/quarter/year by slot
        existing = ReportingPeriod.objects.filter(**slot).first()
        if existing is not None:
            if existing.status == "DRAFT":
                existing.status = "OPEN"
                existing.save(update_fields=["status"])
            return existing, False
    try:
        with transaction.atomic():
            return ReportingPeriod.objects.create(period_type=period_type, status="OPEN", **fields), True
    except IntegrityError:
        existing = ReportingPeriod.objects.filter(**slot).first()
        if existing is None:
            raise
        return existing, False


def ensure_week(ref_date):
    """Make sure the week containing ref_date, and its month / quarter / year,
    exist. Returns the list of labels that were newly created."""
    monday = monday_of(ref_date)
    created = []
    # The week itself: reuse an existing one that already covers this date
    # (imported weeks may not start on a Monday), else create Monday-Sunday.
    period, was_created = _ensure("WEEKLY", ref_date, build_date=monday)
    if was_created:
        created.append(f"WEEKLY: {period.label}")
    # Month / quarter / year are decided by the week's Monday.
    for ptype in ("MONTHLY", "QUARTERLY", "ANNUAL"):
        period, was_created = _ensure(ptype, monday)
        if was_created:
            created.append(f"{ptype}: {period.label}")
    return created


def ensure_current_periods(force=False, today=None):
    """Open this week's periods. Throttled unless force=True."""
    global _last_check
    now = time.monotonic()
    if not force and now - _last_check < _THROTTLE_SECONDS:
        return []
    created = ensure_week(today or local_today())
    _last_check = now
    return created


def ensure_range(start, end):
    """Open every week from start to end (inclusive). For catching up after
    the server was off for a while, or opening a whole year in advance."""
    created = []
    d = monday_of(start)
    while d <= end:
        created += ensure_week(d)
        d += timedelta(days=7)
    return created


def backfill_parents():
    """For periods that already exist: create any missing month / quarter /
    year that a weekly period falls in, so old data is grouped too."""
    from apps.periods.models import ReportingPeriod
    created = []
    seen = set()
    for start in ReportingPeriod.objects.filter(period_type="WEEKLY").values_list("start_date", flat=True):
        for ptype in ("MONTHLY", "QUARTERLY", "ANNUAL"):
            key = (ptype, start.year, start.month if ptype == "MONTHLY" else (start.month - 1) // 3 if ptype == "QUARTERLY" else 0)
            if key in seen:
                continue
            seen.add(key)
            period, was_created = _ensure(ptype, start)
            if was_created:
                created.append(f"{ptype}: {period.label}")
    return created