"""Validates and imports parsed rows into KPI / KPIResult records.
Same function runs as a dry run for preview and for real on commit,
so preview and commit can never disagree about what would happen.
"""
import calendar
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace

from django.db import transaction

from apps.kpis.models import KPI
from apps.organisation.models import Department
from apps.periods.models import ReportingPeriod

VALID_DIRECTIONS = {"HIGHER_IS_BETTER", "LOWER_IS_BETTER", "EXACT_TARGET", "RANGE", "BOOLEAN", "MANUAL_SCORE"}
VALID_FREQUENCIES = {"WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"}
DEPT_CODE_IN_NAME = re.compile(r"^(.*?)\s*\(([A-Za-z0-9_\-]+)\)\s*$")


def import_rows(rows, kind, organisation_id, dry_run=True):
    if kind == "results":
        return _import_results(rows, organisation_id, dry_run)
    if kind == "definitions":
        return _import_definitions(rows, organisation_id, dry_run)
    if kind == "tracker_results":
        return _import_tracker_results(rows, organisation_id, dry_run)
    return {
        "total": len(rows),
        "imported": 0,
        "skipped": len(rows),
        "errors": [
            "Could not tell whether this file contains KPI results or KPI definitions. "
            "Check your column headers against the template."
        ],
    }


def _to_decimal(value, field_name, row_num, errors):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        errors.append(f"Row {row_num}: '{field_name}' is not a valid number ({value!r})")
        return None


def _apply_actual_value(existing_or_new, actual_value, actual_was_blank, notes):
    """Never overwrite a real actual_value with a blank one, an empty cell in a
    re-imported row means 'not entered yet', not 'clear what's there'.
    """
    if not actual_was_blank:
        existing_or_new.actual_value = actual_value
    if notes:
        existing_or_new.notes = notes


@transaction.atomic
def _import_results(rows, organisation_id, dry_run):
    from apps.results.models import KPIResult

    errors, imported, skipped = [], 0, 0
    sp = transaction.savepoint()

    for i, row in enumerate(rows, start=2):  # row 1 is the header
        kpi_code = (row.get("kpi_code") or "").strip()
        dept_name = (row.get("department") or "").strip()
        period_label = (row.get("period") or "").strip()
        actual_raw = row.get("actual") if row.get("actual") is not None else row.get("actual_value")
        actual_was_blank = actual_raw in (None, "")
        notes = row.get("notes") or ""

        if not kpi_code:
            errors.append(f"Row {i}: missing KPI code")
            skipped += 1
            continue

        kpi = (
            KPI.objects
            .filter(code=kpi_code, department__organisation_id=organisation_id)
            .select_related("department")
            .first()
        )
        if not kpi:
            errors.append(f"Row {i}: no KPI found with code '{kpi_code}'")
            skipped += 1
            continue

        if dept_name and dept_name.lower() != kpi.department.name.lower():
            errors.append(f"Row {i}: department '{dept_name}' doesn't match KPI's department '{kpi.department.name}'")
            skipped += 1
            continue

        if not period_label:
            errors.append(f"Row {i}: missing period")
            skipped += 1
            continue

        period = ReportingPeriod.objects.filter(label__iexact=period_label).first()
        if not period:
            errors.append(f"Row {i}: no reporting period found matching '{period_label}'")
            skipped += 1
            continue

        actual_value = _to_decimal(actual_raw, "Actual", i, errors)
        if not actual_was_blank and actual_value is None:
            skipped += 1
            continue

        if not dry_run:
            existing = KPIResult.objects.filter(kpi=kpi, reporting_period=period).first()
            if existing:
                _apply_actual_value(existing, actual_value, actual_was_blank, notes)
                existing.save()
            else:
                new_result = KPIResult(
                    kpi=kpi,
                    department=kpi.department,
                    reporting_period=period,
                    period_type=period.period_type,
                    period_label=period.label,
                    period_start_date=period.start_date,
                    period_end_date=period.end_date,
                    reporting_year=period.reporting_year,
                    week_number=period.week_number,
                    month=period.month,
                    quarter=period.quarter,
                    target_value=kpi.target_value,
                    calculation_direction=kpi.calculation_direction,
                    warning_threshold=kpi.warning_threshold,
                    responsible_person=kpi.responsible_person,
                )
                _apply_actual_value(new_result, actual_value, actual_was_blank, notes)
                new_result.save()

        imported += 1

    if dry_run:
        transaction.savepoint_rollback(sp)
    else:
        transaction.savepoint_commit(sp)

    return {"total": len(rows), "imported": imported, "skipped": skipped, "errors": errors}


def _generate_kpi_code(department):
    """Department.code is a short prefix like 'OPS' or 'BD'. Find the next free
    sequential number under that prefix rather than guessing from the KPI name.
    """
    prefix = (department.code or department.name[:3]).upper().replace(" ", "")
    existing_codes = KPI.objects.filter(code__startswith=f"{prefix}-").values_list("code", flat=True)
    max_n = 0
    for code in existing_codes:
        suffix = code.rsplit("-", 1)[-1]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))
    return f"{prefix}-{max_n + 1:03d}"


def _split_department_name_and_code(raw_name):
    """Some department cells already carry a code in parentheses, e.g.
    'Operations (S_E_A_P)'. Use that instead of guessing one when it's there.
    """
    match = DEPT_CODE_IN_NAME.match(raw_name.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip().upper()
    return raw_name.strip(), None


def _generate_department_code(name, organisation_id):
    words = re.findall(r"[A-Za-z0-9]+", name)
    initials = "".join(w[0] for w in words).upper()[:6] or "DEPT"
    code = initials
    n = 1
    while Department.objects.filter(organisation_id=organisation_id, code=code).exists():
        n += 1
        code = f"{initials}{n}"
    return code


def _get_or_create_department(cache, organisation_id, raw_name, dry_run):
    """Returns (department, was_created, display_name). Cached per import run
    so 50 rows for the same brand-new department only create and report it once.
    """
    name, explicit_code = _split_department_name_and_code(raw_name)
    cache_key = name.lower()
    if cache_key in cache:
        return cache[cache_key], False, name

    department = Department.objects.filter(organisation_id=organisation_id, name__iexact=name).first()
    if department:
        cache[cache_key] = department
        return department, False, name

    if dry_run:
        stub = SimpleNamespace(name=name, code=explicit_code or "NEW", organisation_id=organisation_id)
        cache[cache_key] = stub
        return stub, True, name

    department = Department.objects.create(
        organisation_id=organisation_id,
        name=name,
        code=explicit_code or _generate_department_code(name, organisation_id),
    )
    cache[cache_key] = department
    return department, True, name


def _get_or_create_kpi(department, kpi_name, target_value, period_type, dry_run):
    """Looks up an existing KPI by department + name. If missing, auto-creates
    one from the row's own data, this is a first-time migration path, so
    requiring KPIs to already exist would block every row on day one.

    A missing target no longer blocks creation, the KPI is created with a
    placeholder target of 0 instead, and the caller is told via needs_target
    so it can flag that this KPI needs an admin to set the real value.

    Returns (kpi, was_created, needs_target).
    """
    if isinstance(department, SimpleNamespace):
        # A brand-new, not-yet-persisted department in a dry run, nothing
        # could possibly exist under it yet, so skip the query entirely.
        kpi = None
    else:
        kpi = (
            KPI.objects
            .filter(department=department, name__iexact=kpi_name)
            .select_related("department")
            .first()
        )

    if kpi:
        return kpi, False, False

    needs_target = target_value is None
    effective_target = target_value if target_value is not None else Decimal("0")

    if dry_run:
        stub = SimpleNamespace(
            code=None,
            name=kpi_name,
            department=department,
            target_value=effective_target,
            calculation_direction="HIGHER_IS_BETTER",
            warning_threshold=Decimal("0.85"),
            responsible_person=None,
        )
        return stub, True, needs_target

    kpi = KPI.objects.create(
        code=_generate_kpi_code(department),
        name=kpi_name,
        department=department,
        target_value=effective_target,
        calculation_direction="HIGHER_IS_BETTER",
        reporting_frequency=period_type,
        unit_type="NUMBER",
        warning_threshold=Decimal("0.85"),
    )
    return kpi, True, needs_target


def _build_period_fields(period_type, ref_date):
    """Computes the date range, label, and period-number fields for a new
    ReportingPeriod from a single reference date pulled out of the row.
    """
    if period_type == "WEEKLY":
        start = ref_date
        end = start + timedelta(days=6)
        week_number = start.isocalendar()[1]
        return {
            "start_date": start, "end_date": end, "reporting_year": start.year,
            "week_number": week_number, "month": None, "quarter": None,
            "label": f"Week {week_number}, {start.day}-{end.day} {end.strftime('%B %Y')}",
        }
    if period_type == "MONTHLY":
        start = ref_date.replace(day=1)
        end = start.replace(day=calendar.monthrange(start.year, start.month)[1])
        return {
            "start_date": start, "end_date": end, "reporting_year": start.year,
            "week_number": None, "month": start.month, "quarter": None,
            "label": start.strftime("%B %Y"),
        }
    if period_type == "QUARTERLY":
        quarter = (ref_date.month - 1) // 3 + 1
        first_month = (quarter - 1) * 3 + 1
        last_month = first_month + 2
        start = date(ref_date.year, first_month, 1)
        end = date(ref_date.year, last_month, calendar.monthrange(ref_date.year, last_month)[1])
        return {
            "start_date": start, "end_date": end, "reporting_year": ref_date.year,
            "week_number": None, "month": None, "quarter": quarter,
            "label": f"Q{quarter} {ref_date.year}",
        }
    # ANNUAL
    return {
        "start_date": date(ref_date.year, 1, 1), "end_date": date(ref_date.year, 12, 31),
        "reporting_year": ref_date.year, "week_number": None, "month": None, "quarter": None,
        "label": str(ref_date.year),
    }


def _get_or_create_period(cache, period_type, ref_date, dry_run):
    """Returns (period, was_created). Cached per import run for the same reason
    department creation is, one new period shouldn't get recreated per row.
    """
    period = ReportingPeriod.objects.filter(
        period_type=period_type, start_date__lte=ref_date, end_date__gte=ref_date
    ).first()
    if period:
        return period, False

    fields = _build_period_fields(period_type, ref_date)
    cache_key = (period_type, fields["reporting_year"], fields["week_number"], fields["month"], fields["quarter"])
    if cache_key in cache:
        return cache[cache_key], True

    if dry_run:
        stub = SimpleNamespace(period_type=period_type, **fields)
        cache[cache_key] = stub
        return stub, True

    period = ReportingPeriod.objects.create(period_type=period_type, status="OPEN", **fields)
    cache[cache_key] = period
    return period, True


@transaction.atomic
def _import_tracker_results(rows, organisation_id, dry_run):
    """Rows here come from tracker_parser: department + KPI name instead of a
    code, and an actual date instead of a period label string.

    Departments, KPIs, and reporting periods are all auto-created from the
    row when missing, this is the path a brand-new organisation hits on its
    first import, so nothing can be required to pre-exist.

    One simplification worth knowing: a KPI is matched by department + name
    only, not by which sheet (Weekly/Monthly/etc) it came from. If the same
    objective text appears on more than one sheet, they're treated as the
    same KPI, with whichever reporting_frequency it was first created under.
    """
    from apps.results.models import KPIResult

    errors, needs_attention, new_departments, new_kpis, new_periods = [], [], [], [], []
    imported, skipped = 0, 0
    dept_cache, period_cache = {}, {}
    sp = transaction.savepoint()

    for i, row in enumerate(rows, start=1):
        location = f"{row['period_type'].title()} sheet, row {i} ({row['department']} / {row['kpi_name']})"

        department, dept_created, dept_display_name = _get_or_create_department(
            dept_cache, organisation_id, row["department"], dry_run
        )
        if dept_created:
            new_departments.append(dept_display_name)

        target_value = _to_decimal(row.get("target"), "Target", i, errors)

        kpi, kpi_created, needs_target = _get_or_create_kpi(
            department, row["kpi_name"], target_value, row["period_type"], dry_run
        )
        kpi_label = f"{dept_display_name} / {row['kpi_name']}"
        if kpi_created:
            new_kpis.append(kpi_label)
        if needs_target:
            needs_attention.append(f"{kpi_label}: no target in the sheet, created with a placeholder target of 0 — set the real target in KPI Library.")

        if row["period_date"] is None:
            errors.append(f"{location}: could not read a date from this row (expected something like 'Week of 22 June 2026').")
            skipped += 1
            continue

        period, period_created = _get_or_create_period(period_cache, row["period_type"], row["period_date"], dry_run)
        if period_created:
            new_periods.append(period.label)

        actual_raw = row.get("actual")
        actual_was_blank = actual_raw in (None, "")
        actual_value = _to_decimal(actual_raw, "Actual", i, errors) if not actual_was_blank else None
        if not actual_was_blank and actual_value is None:
            skipped += 1
            continue

        if not dry_run:
            existing = KPIResult.objects.filter(kpi=kpi, reporting_period=period).first()
            if existing:
                _apply_actual_value(existing, actual_value, actual_was_blank, row["notes"])
                existing.save()
            else:
                new_result = KPIResult(
                    kpi=kpi,
                    department=kpi.department,
                    reporting_period=period,
                    period_type=period.period_type,
                    period_label=period.label,
                    period_start_date=period.start_date,
                    period_end_date=period.end_date,
                    reporting_year=period.reporting_year,
                    week_number=period.week_number,
                    month=period.month,
                    quarter=period.quarter,
                    target_value=kpi.target_value,
                    calculation_direction=kpi.calculation_direction,
                    warning_threshold=kpi.warning_threshold,
                    responsible_person=kpi.responsible_person,
                )
                _apply_actual_value(new_result, actual_value, actual_was_blank, row["notes"])
                new_result.save()

        imported += 1

    if dry_run:
        transaction.savepoint_rollback(sp)
    else:
        transaction.savepoint_commit(sp)

    return {
        "total": len(rows),
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "needs_attention": needs_attention,
        "new_departments": new_departments,
        "new_kpis": new_kpis,
        "new_periods": new_periods,
    }


@transaction.atomic
def _import_definitions(rows, organisation_id, dry_run):
    errors, imported, skipped = [], 0, 0
    sp = transaction.savepoint()

    departments = {d.name.lower(): d for d in Department.objects.filter(organisation_id=organisation_id)}

    for i, row in enumerate(rows, start=2):
        code = (row.get("code") or "").strip()
        name = (row.get("name") or "").strip()
        dept_name = (row.get("department") or "").strip()
        target_raw = row.get("target") if row.get("target") is not None else row.get("target_value")
        unit = (row.get("unit") or "").strip()
        direction = (row.get("direction") or row.get("calculation_direction") or "HIGHER_IS_BETTER").strip().upper()
        frequency = (row.get("frequency") or row.get("reporting_frequency") or "MONTHLY").strip().upper()

        if not code or not name:
            errors.append(f"Row {i}: missing KPI code or name")
            skipped += 1
            continue

        department = departments.get(dept_name.lower())
        if not department:
            errors.append(f"Row {i}: no department found named '{dept_name}'")
            skipped += 1
            continue

        target_value = _to_decimal(target_raw, "Target", i, errors)
        if target_value is None:
            skipped += 1
            continue

        if direction not in VALID_DIRECTIONS:
            errors.append(f"Row {i}: '{direction}' is not a valid direction")
            skipped += 1
            continue

        if frequency not in VALID_FREQUENCIES:
            errors.append(f"Row {i}: '{frequency}' is not a valid frequency")
            skipped += 1
            continue

        if not dry_run:
            KPI.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "department": department,
                    "target_value": target_value,
                    "unit_type": "CUSTOM",
                    "custom_unit": unit,
                    "calculation_direction": direction,
                    "reporting_frequency": frequency,
                },
            )

        imported += 1

    if dry_run:
        transaction.savepoint_rollback(sp)
    else:
        transaction.savepoint_commit(sp)

    return {"total": len(rows), "imported": imported, "skipped": skipped, "errors": errors}