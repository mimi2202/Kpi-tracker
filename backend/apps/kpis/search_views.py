"""Global search: departments, KPIs, and results, in one query, scoped by
role the same way every other view in this app already is — a member never
sees another department's results just because they searched for it.
"""
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.kpis.models import KPI


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response({"departments": [], "kpis": [], "results": []})

        user = request.user
        org_id = user.organisation_id

        # Departments — reuses the same visibility rule as the rest of the app.
        dept_qs = user.get_visible_departments().filter(name__icontains=query)[:5]
        departments = [{"id": str(d.id), "name": d.name, "code": d.code} for d in dept_qs]

        # KPIs — same role scoping pattern as results/actions.
        kpi_qs = KPI.objects.filter(
            department__organisation_id=org_id, is_active=True
        ).select_related("department")

        if user.role == Role.ADMIN:
            pass
        elif user.role == Role.TEAM_LEADER:
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(
                user=user, is_department_head=True
            ).values_list("department_id", flat=True)
            kpi_qs = kpi_qs.filter(department_id__in=dept_ids)
        else:
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(user=user).values_list("department_id", flat=True)
            kpi_qs = kpi_qs.filter(department_id__in=dept_ids)

        kpi_qs = kpi_qs.filter(Q(name__icontains=query) | Q(code__icontains=query))[:5]
        kpis = [
            {"id": str(k.id), "code": k.code, "name": k.name, "department_name": k.department.name}
            for k in kpi_qs
        ]

        # Results — the model's own visibility method is already org + role scoped.
        result_qs = user.get_visible_kpi_results().select_related("kpi", "department")
        result_qs = result_qs.filter(
            Q(kpi__name__icontains=query) | Q(kpi__code__icontains=query) | Q(notes__icontains=query)
        )[:5]
        results = [
            {
                "id": str(r.id), "kpi_code": r.kpi.code, "kpi_name": r.kpi.name,
                "department_name": r.department.name, "period_label": r.period_label,
                "rag_status": r.rag_status,
            }
            for r in result_qs
        ]

        return Response({"departments": departments, "kpis": kpis, "results": results})