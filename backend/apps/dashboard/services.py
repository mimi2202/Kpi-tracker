"""Dashboard aggregation service - RBAC with team breakdown. Org-scoped."""
from decimal import Decimal
from django.db.models import Avg, Count, Q
from apps.results.models import KPIResult
from apps.organisation.models import Department
from apps.periods.models import ReportingPeriod
from apps.accounts.models import User, Role


class DashboardService:
    def __init__(self, period_type=None, reporting_year=None, department_id=None, period_id=None, user=None):
        self.period_type = period_type
        self.reporting_year = reporting_year
        self.department_id = department_id
        self.period_id = period_id
        self.user = user

    # ---- org-scoped department set (the fix for cross-org leak) ----
    def _get_departments(self):
        """Departments this user may see — ALWAYS bounded to their organisation."""
        qs = Department.objects.filter(is_active=True)
        if self.user is not None:
            # Bound to the user's org no matter their role (admins included).
            qs = qs.filter(organisation_id=self.user.organisation_id)
            if self.user.role != Role.ADMIN:
                # Non-admins further restricted to departments they can see.
                visible_ids = self.user.get_visible_departments().values_list("id", flat=True)
                qs = qs.filter(id__in=visible_ids)
        return qs

    def get_summary(self):
        results = self._get_results()
        total = results.count()
        if total == 0:
            return {
                "average_achievement": None, "on_track_count": 0,
                "at_risk_count": 0, "off_track_count": 0,
                "no_data_count": 0, "previous_average": None, "trend": "no_data",
            }
        on_track = results.filter(rag_status="ON_TRACK").count()
        at_risk = results.filter(rag_status="AT_RISK").count()
        off_track = results.filter(rag_status="OFF_TRACK").count()
        no_data = results.filter(rag_status="NO_DATA").count()
        avg = results.exclude(achievement_percentage__isnull=True).aggregate(avg=Avg("achievement_percentage"))["avg"]
        return {
            "average_achievement": round(float(avg), 1) if avg else None,
            "on_track_count": on_track, "at_risk_count": at_risk,
            "off_track_count": off_track, "no_data_count": no_data,
            "previous_average": None, "trend": "stable",
        }

    def get_department_performance(self):
        departments = self._get_departments()
        data = []
        for dept in departments:
            results = self._get_results().filter(department=dept)
            total = results.count()
            if total == 0:
                data.append({
                    "id": str(dept.id),
                    "department": {"id": str(dept.id), "name": dept.name, "code": dept.code, "colour": dept.colour},
                    "department_name": dept.name, "department_colour": dept.colour,
                    "average_achievement": None, "composite_score": None,
                    "rag_status": "NO_DATA", "total_kpis": 0,
                    "on_track_count": 0, "at_risk_count": 0, "off_track_count": 0,
                    "trend": "stable", "outstanding_actions": 0,
                    "team_members": [],
                })
                continue
            avg = results.exclude(achievement_percentage__isnull=True).aggregate(avg=Avg("achievement_percentage"))["avg"]
            rag = "NO_DATA"
            if avg is not None:
                if avg >= 85: rag = "ON_TRACK"
                elif avg >= 75: rag = "AT_RISK"
                else: rag = "OFF_TRACK"
            data.append({
                "id": str(dept.id),
                "department": {"id": str(dept.id), "name": dept.name, "code": dept.code, "colour": dept.colour},
                "department_name": dept.name, "department_colour": dept.colour,
                "average_achievement": round(float(avg), 1) if avg else None,
                "composite_score": round(float(avg), 1) if avg else None,
                "rag_status": rag, "total_kpis": total,
                "on_track_count": results.filter(rag_status="ON_TRACK").count(),
                "at_risk_count": results.filter(rag_status="AT_RISK").count(),
                "off_track_count": results.filter(rag_status="OFF_TRACK").count(),
                "trend": "stable", "outstanding_actions": 0,
                "team_members": self._get_dept_members(dept),
            })
        return data

    def _get_dept_members(self, department):
        from apps.organisation.models import UserDepartment
        members = []
        user_depts = UserDepartment.objects.filter(department=department).select_related("user")
        for ud in user_depts:
            u = ud.user
            results = self._get_results().filter(responsible_person=u)
            avg = results.exclude(achievement_percentage__isnull=True).aggregate(avg=Avg("achievement_percentage"))["avg"]
            members.append({
                "user_id": str(u.id),
                "name": u.full_name,
                "email": u.email,
                "role": u.get_role_display(),
                "is_head": ud.is_department_head,
                "achievement": round(float(avg), 1) if avg else None,
                "kpi_count": results.count(),
                "on_track": results.filter(rag_status="ON_TRACK").count(),
                "at_risk": results.filter(rag_status="AT_RISK").count(),
                "off_track": results.filter(rag_status="OFF_TRACK").count(),
            })
        for m in members:
            if m["role"] == "Team Leader":
                member_scores = [x["achievement"] for x in members if x["role"] == "Member" and x["achievement"] is not None]
                if member_scores:
                    m["achievement"] = round(sum(member_scores) / len(member_scores), 1)
                    m["kpi_count"] = sum(x["kpi_count"] for x in members if x["role"] == "Member")
        return members

    def get_trend_data(self, departments=None):
        results = self._get_results()
        if departments: results = results.filter(department_id__in=departments)
        data = []
        for r in results.select_related("department").order_by("period_start_date"):
            data.append({
                "period_label": r.period_label or str(r.period_start_date),
                "achievement": float(r.achievement_percentage) if r.achievement_percentage else None,
                "target": float(r.target_value) if r.target_value else 0,
                "department_name": r.department.name,
                "department_colour": r.department.colour,
            })
        return data

    def get_kpi_details(self):
        results = self._get_results().select_related("kpi", "department", "responsible_person")
        data = []
        for r in results:
            data.append({
                "id": str(r.id), "kpi": str(r.kpi_id),
                "kpi_code": r.kpi.code, "kpi_name": r.kpi.name,
                "department": str(r.department_id), "department_name": r.department.name,
                "period": str(r.reporting_period_id), "period_label": r.period_label,
                "target_snapshot": float(r.target_value) if r.target_value else 0,
                "target_value": float(r.target_value) if r.target_value else 0,
                "actual_value": float(r.actual_value) if r.actual_value is not None else None,
                "achievement_percentage": float(r.achievement_percentage) if r.achievement_percentage else None,
                "variance_display": r.variance_display or "",
                "rag_status": r.rag_status,
                "rag_display": r.get_rag_status_display() if hasattr(r, 'get_rag_status_display') else r.rag_status,
                "trend_status": r.trend_status or "NO_DATA", "trend_icon": r.trend_status or "-",
                "submission_status": r.submission_status,
                "responsible_name": r.responsible_person.get_full_name() if r.responsible_person else "",
                "notes": r.notes or "", "corrective_action": r.corrective_action or "",
                "created_at": str(r.created_at), "updated_at": str(r.updated_at),
            })
        return data

    def get_scorecard(self):
        departments = self._get_departments()
        data = []
        for dept in departments:
            freq_scores = {}
            for freq in ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]:
                r = self._get_results().filter(department=dept, period_type=freq)
                if self.period_id: r = r.filter(reporting_period_id=self.period_id)
                avg = r.exclude(achievement_percentage__isnull=True).aggregate(avg=Avg("achievement_percentage"))["avg"]
                freq_scores[f"{freq.lower()}_achievement"] = round(float(avg), 1) if avg else None
            results = self._get_results().filter(department=dept)
            if self.period_id: results = results.filter(reporting_period_id=self.period_id)
            total = results.count()
            composite = results.exclude(achievement_percentage__isnull=True).aggregate(avg=Avg("achievement_percentage"))["avg"]
            rag = "NO_DATA"
            if composite is not None:
                if composite >= 85: rag = "ON_TRACK"
                elif composite >= 75: rag = "AT_RISK"
                else: rag = "OFF_TRACK"
            data.append({
                "id": str(dept.id), "department_name": dept.name, "department_colour": dept.colour,
                "department": {"id": str(dept.id), "name": dept.name, "colour": dept.colour},
                **freq_scores,
                "composite_score": round(float(composite), 1) if composite else None,
                "average_achievement": round(float(composite), 1) if composite else None,
                "rag_status": rag, "total_kpis": total,
                "on_track_count": results.filter(rag_status="ON_TRACK").count(),
                "at_risk_count": results.filter(rag_status="AT_RISK").count(),
                "off_track_count": results.filter(rag_status="OFF_TRACK").count(),
                "trend": "stable",
            })
        return data

    def _get_results(self):
        # Org-scoped base queryset. Never fall back to KPIResult.objects.all()
        # for an anonymous/missing user — return nothing rather than leak.
        if self.user is not None:
            results = self.user.get_visible_kpi_results()
            # Belt-and-suspenders: hard-bound to the user's org even if
            # get_visible_kpi_results is ever too broad.
            results = results.filter(department__organisation_id=self.user.organisation_id)
        else:
            results = KPIResult.objects.none()
        if self.period_id:
            results = results.filter(reporting_period_id=self.period_id)
        elif self.period_type:
            results = results.filter(period_type=self.period_type)
        if self.reporting_year:
            results = results.filter(reporting_year=self.reporting_year)
        if self.department_id:
            results = results.filter(department_id=self.department_id)
        return results