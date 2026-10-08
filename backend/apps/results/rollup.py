"""Roll-up of lower-level KPI results into monthly / quarterly / annual totals.

Weekly entries are the source of truth for weekly-frequency KPIs. Their
monthly result is the roll-up of the weeks that START in that month, the
quarterly result is the roll-up of the three monthly results, and the annual
result is the roll-up of the four quarterly results.

A KPI whose own reporting_frequency is MONTHLY is entered by hand at the
monthly level, so nothing is rolled up INTO that level for it (it still rolls
up into quarterly and annual). Same idea for QUARTERLY / ANNUAL KPIs.

How values are combined depends on the kind of KPI:
  * counts, money, hours, days ... -> SUM, and the target is the sum of the
    targets of the periods that actually contributed a value
  * percentages, ratios, scores    -> AVERAGE, and the target stays the KPI's
    own target (a 95% target is still 95% for a month)

Entry point: rollup_results(keys) where each key is
    (kpi_id, responsible_person_id, period_type, period_start_date)
and rollup_key(result) builds that tuple from a saved KPIResult.
"""
import logging
import re
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

logger = logging.getLogger(__name__)

CHAIN = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]

SUM = "SUM"
AVG = "AVG"

_AVG_UNITS = {"PERCENTAGE", "PERCENT", "RATIO", "SCORE", "RATING", "RATE", "BOOLEAN"}
_SUM_UNITS = {"CURRENCY", "COUNT", "HOURS", "DAYS", "MONEY"}
_AVG_DIRECTIONS = {"BOOLEAN", "MANUAL_SCORE"}
_AVG_NAME = re.compile(
    r"(%|\bpercent|\bpercentage\b|\brate\b|\bratio\b|\bscore\b|\baverage\b|\bavg\b|"
    r"\bsatisfaction\b|\butili[sz]ation\b|\baccuracy\b|\bcompliance\b|\buptime\b|\bnps\b)",
    re.IGNORECASE,
)
_ALWAYS_AVG_NAME = re.compile(r"(%|\baverage\b|\bavg\b)", re.IGNORECASE)

_Q = Decimal("0.0001")


def aggregation_mode(kpi):
    """SUM or AVG. Decided by the KPI's unit; when the unit is just the
    generic NUMBER/CUSTOM that imports create, fall back to the KPI name and
    the custom unit text (so '% On-time delivery' is averaged, not summed)."""
    unit = (getattr(kpi, "unit_type", "") or "").upper()
    custom = (getattr(kpi, "custom_unit", "") or "").strip().lower()
    direction = (getattr(kpi, "calculation_direction", "") or "").upper()
    name = getattr(kpi, "name", "") or ""

    if unit in _AVG_UNITS or direction in _AVG_DIRECTIONS:
        return AVG
    if "%" in custom or custom in {"percent", "percentage", "score", "rating", "ratio", "rate"}:
        return AVG
    if _ALWAYS_AVG_NAME.search(name):
        return AVG
    if unit in _SUM_UNITS:
        return SUM
    if _AVG_NAME.search(name):
        return AVG
    return SUM


def rollup_key(result):
    return (result.kpi_id, result.responsible_person_id, result.period_type, result.period_start_date)


def _native_index(kpi):
    freq = (getattr(kpi, "reporting_frequency", "") or "").upper()
    return CHAIN.index(freq) if freq in CHAIN else None


def _q(value):
    return Decimal(value).quantize(_Q, rounding=ROUND_HALF_UP)


def _get_period(cache, period_type, ref_date):
    from apps.imports.importer import _build_period_fields
    from apps.periods.models import ReportingPeriod

    fields = _build_period_fields(period_type, ref_date)
    key = (period_type, fields["start_date"])
    if key in cache:
        return cache[key]
    period = ReportingPeriod.objects.filter(
        period_type=period_type, start_date__lte=ref_date, end_date__gte=ref_date
    ).first()
    if period is None:
        period = ReportingPeriod.objects.create(period_type=period_type, status="OPEN", **fields)
    cache[key] = period
    return period


def _recompute(kpi, person_id, dst_type, dst_start, src_type, period_cache):
    from apps.results.models import KPIResult

    period = _get_period(period_cache, dst_type, dst_start)

    sources = list(
        KPIResult.objects.filter(
            kpi_id=kpi.id,
            responsible_person_id=person_id,
            period_type=src_type,
            period_start_date__gte=period.start_date,
            period_start_date__lte=period.end_date,
            actual_value__isnull=False,
        ).only("actual_value", "target_value")
    )

    existing = KPIResult.objects.filter(
        kpi_id=kpi.id, reporting_period=period, responsible_person_id=person_id
    ).first()

    if not sources:
        # Nothing left underneath: remove a stale auto total, never a real entry.
        if existing is not None and existing.is_rollup:
            existing.delete()
        return

    if aggregation_mode(kpi) == SUM:
        actual = sum((s.actual_value for s in sources), Decimal("0"))
        target = sum((s.target_value for s in sources), Decimal("0"))
    else:
        actual = sum((s.actual_value for s in sources), Decimal("0")) / len(sources)
        target = kpi.target_value
    actual = _q(actual)
    target = _q(target)

    obj = existing or KPIResult(
        kpi=kpi,
        department=kpi.department,
        reporting_period=period,
        responsible_person_id=person_id,
        calculation_direction=kpi.calculation_direction,
        warning_threshold=kpi.warning_threshold,
    )
    obj.period_type = period.period_type
    obj.period_label = period.label
    obj.period_start_date = period.start_date
    obj.period_end_date = period.end_date
    obj.reporting_year = period.reporting_year
    obj.week_number = period.week_number
    obj.month = period.month
    obj.quarter = period.quarter
    obj.target_value = target
    obj.actual_value = actual
    obj.is_rollup = True
    obj._skip_rollup = True  # we walk the chain ourselves

    try:
        obj.save()
    except ValueError:
        # e.g. HIGHER_IS_BETTER KPI whose target is still the placeholder 0:
        # keep the total, leave achievement/RAG at their defaults.
        obj._skip_calc = True
        obj.save()


def rollup_results(keys):
    """Recompute every roll-up affected by the given lower-level results.
    Safe to call with a mix of weekly / monthly / quarterly keys."""
    from apps.kpis.models import KPI

    pending = set(keys)
    if not pending:
        return 0

    kpis = KPI.objects.select_related("department").in_bulk({k[0] for k in pending})
    period_cache = {}
    touched = 0

    with transaction.atomic():
        for level in range(len(CHAIN) - 1):
            src_type, dst_type = CHAIN[level], CHAIN[level + 1]
            targets = set()
            for kpi_id, person_id, ptype, start in [k for k in pending if k[2] == src_type]:
                kpi = kpis.get(kpi_id)
                if kpi is None:
                    continue
                native = _native_index(kpi)
                if native is None or native >= level + 1:
                    continue  # this KPI is entered directly at (or above) dst level
                from apps.imports.importer import _build_period_fields
                dst_start = _build_period_fields(dst_type, start)["start_date"]
                targets.add((kpi_id, person_id, dst_type, dst_start))

            for kpi_id, person_id, _, dst_start in targets:
                _recompute(kpis[kpi_id], person_id, dst_type, dst_start, src_type, period_cache)
                pending.add((kpi_id, person_id, dst_type, dst_start))
                touched += 1
    return touched