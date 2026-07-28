# backend/apps/results/generation.py
"""
Generate KPIResult rows for a period from standing KPIAssignments.

Single source of truth used by BOTH the period-open signal (auto) and the
manual 'generate' endpoint / management command (backfill). Idempotent:
get_or_create means re-running never duplicates.
"""
from decimal import Decimal


def generate_results_for_period(period, organisation_id=None):
    """
    Create DRAFT KPIResult rows for every active assignment whose KPI belongs to
    `organisation_id` (or all orgs if None). Returns count created.
    """
    from apps.kpis.models import KPIAssignment
    from apps.results.models import KPIResult

    assignments = (
        KPIAssignment.objects
        .filter(is_active=True)
        .select_related("kpi", "kpi__department", "user")
    )
    if organisation_id is not None:
        assignments = assignments.filter(kpi__department__organisation_id=organisation_id)

    created = 0
    for a in assignments:
        kpi = a.kpi
        _, was_created = KPIResult.objects.get_or_create(
            kpi=kpi,
            reporting_period=period,
            responsible_person=a.user,
            defaults={
                "department": kpi.department,
                # VERIFY these attribute names against your ReportingPeriod model.
                "period_type": getattr(period, "period_type", "WEEKLY"),
                "period_start_date": period.start_date,
                "period_end_date": period.end_date,
                "period_label": getattr(period, "label", ""),
                "reporting_year": getattr(period, "year", period.start_date.year),
                "week_number": getattr(period, "week_number", None),
                "month": getattr(period, "month", None),
                "quarter": getattr(period, "quarter", None),
                "target_value": kpi.target_value,
                "calculation_direction": kpi.calculation_direction,
                "warning_threshold": getattr(kpi, "warning_threshold", Decimal("0.85")) or Decimal("0.85"),
            },
        )
        created += 1 if was_created else 0
    return created