"""Builds the shared data context used by every export format.
One query pass here, all three generators (csv, excel, pdf) read from the same context.

Scoping by role:
  ADMIN        — every department in the organisation
  TEAM_LEADER  — only departments they lead (everyone reporting into that department, not just them)
  everyone else — only their own results

Department summary is computed here from KPIResult directly, not from
DepartmentPeriodScore. That cache table exists in the schema but nothing
populates it yet, so reading it silently returns nothing. Computing it live
means the report is always correct regardless of whether that job ever gets built.
"""
from collections import defaultdict

from django.db.models import Count, Avg

from apps.results.models import KPIResult
from apps.periods.models import ReportingPeriod
from apps.organisation.models import Department, UserDepartment
from apps.accounts.models import Role

RAG_LABELS = {
    "ON_TRACK": "On Track",
    "AT_RISK": "At Risk",
    "OFF_TRACK": "Off Track",
    "NO_DATA": "No Data",
}


def get_report_context(user, period_type):
    period = (
        ReportingPeriod.objects
        .filter(period_type=period_type)
        .order_by("-start_date")
        .first()
    )

    results = KPIResult.objects.none()

    if period is not None:
        results = (
            KPIResult.objects
            .filter(department__organisation_id=user.organisation_id, reporting_period=period)
            .select_related("kpi", "department", "responsible_person")
        )
        results = _scope_to_role(results, user)
        results = results.order_by("department__display_order", "kpi__display_order")

    rag_counts = {key: 0 for key in RAG_LABELS}
    for row in results.values("rag_status").annotate(count=Count("id")):
        if row["rag_status"] in rag_counts:
            rag_counts[row["rag_status"]] = row["count"]

    total_kpis = sum(rag_counts.values())
    avg_row = results.exclude(achievement_percentage=None).aggregate(avg=Avg("achievement_percentage"))
    avg_achievement = round(avg_row["avg"], 1) if avg_row["avg"] is not None else None

    return {
        "period": period,
        "period_type": period_type,
        "results": results,
        "dept_scores": _build_department_summary(results),
        "rag_counts": rag_counts,
        "total_kpis": total_kpis,
        "avg_achievement": avg_achievement,
    }


def _scope_to_role(results, user):
    role = getattr(user, "role", None)

    if role == Role.ADMIN:
        return results

    if role == Role.TEAM_LEADER:
        led_department_ids = set(
            UserDepartment.objects
            .filter(user=user, is_department_head=True)
            .values_list("department_id", flat=True)
        ) | set(
            Department.objects
            .filter(department_head=user)
            .values_list("id", flat=True)
        )
        return results.filter(department_id__in=led_department_ids)

    # Any other role: only results this person is responsible for.
    return results.filter(responsible_person=user)


def _build_department_summary(results):
    """Groups the already-scoped results by department. A team leader or member
    only ever sees the departments their own results already came from, so this
    naturally respects the same scoping without a second query.
    """
    buckets = defaultdict(lambda: {
        "name": "",
        "kpi_ids": set(),
        "achievements": [],
        "rag_counts": {key: 0 for key in RAG_LABELS},
    })

    for res in results:
        bucket = buckets[res.department_id]
        bucket["name"] = res.department.name
        bucket["kpi_ids"].add(res.kpi_id)
        if res.achievement_percentage is not None:
            bucket["achievements"].append(float(res.achievement_percentage))
        if res.rag_status in bucket["rag_counts"]:
            bucket["rag_counts"][res.rag_status] += 1

    summary = []
    for bucket in buckets.values():
        achievements = bucket["achievements"]
        summary.append({
            "department_name": bucket["name"],
            "kpi_count": len(bucket["kpi_ids"]),
            "avg_achievement": round(sum(achievements) / len(achievements), 1) if achievements else None,
            "rag_status": _overall_status(bucket["rag_counts"]),
        })

    summary.sort(key=lambda row: row["department_name"])
    return summary


def _overall_status(rag_counts):
    """Worst-status-wins, so a department with any off-track KPI shows as off-track overall."""
    if rag_counts["OFF_TRACK"] > 0:
        return "OFF_TRACK"
    if rag_counts["AT_RISK"] > 0:
        return "AT_RISK"
    if rag_counts["ON_TRACK"] > 0:
        return "ON_TRACK"
    return "NO_DATA"