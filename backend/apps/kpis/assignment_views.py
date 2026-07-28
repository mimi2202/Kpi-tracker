# backend/apps/kpis/assignment_views.py
"""KPI assignment endpoints. Add the router registration to your kpis urls."""
from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.accounts.models import Role, User
from apps.kpis.models import KPI, KPIAssignment


class KPIAssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    kpi_code = serializers.CharField(source="kpi.code", read_only=True)
    kpi_name = serializers.CharField(source="kpi.name", read_only=True)

    class Meta:
        model = KPIAssignment
        fields = ["id", "kpi", "kpi_code", "kpi_name", "user", "user_name",
                  "user_email", "is_active", "assigned_by", "created_at"]
        read_only_fields = ["id", "assigned_by", "created_at"]


class KPIAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = KPIAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["kpi", "user", "is_active"]

    def get_queryset(self):
        u = self.request.user
        qs = KPIAssignment.objects.select_related("kpi", "kpi__department", "user")
        qs = qs.filter(kpi__department__organisation_id=u.organisation_id)  # org scope
        if u.role == Role.TEAM_LEADER:
            # Leaders see assignments for KPIs in departments they head.
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(
                user=u, is_department_head=True
            ).values_list("department_id", flat=True)
            qs = qs.filter(kpi__department_id__in=dept_ids)
        elif u.role == Role.MEMBER:
            qs = qs.filter(user=u)  # members only see their own
        return qs

    def _can_manage(self, kpi):
        u = self.request.user
        if u.role == Role.ADMIN:
            return kpi.department.organisation_id == u.organisation_id
        if u.role == Role.TEAM_LEADER:
            from apps.organisation.models import UserDepartment
            return UserDepartment.objects.filter(
                user=u, is_department_head=True, department_id=kpi.department_id
            ).exists()
        return False

    def perform_create(self, serializer):
        kpi = serializer.validated_data["kpi"]
        target = serializer.validated_data["user"]
        if not self._can_manage(kpi):
            raise PermissionDenied("You can't assign this KPI.")
        if target.organisation_id != self.request.user.organisation_id:
            raise PermissionDenied("User is not in your organisation.")
        serializer.save(assigned_by=self.request.user)

    def perform_destroy(self, instance):
        if not self._can_manage(instance.kpi):
            raise PermissionDenied("You can't remove this assignment.")
        instance.delete()

    @action(detail=False, methods=["post"])
    def set_for_kpi(self, request):
        """Replace the full set of assignees for one KPI in a single call.
        Body: { "kpi_id": "...", "user_ids": ["...", "..."] }"""
        kpi = get_object_or_404(KPI, id=request.data.get("kpi_id"))
        if not self._can_manage(kpi):
            raise PermissionDenied("You can't assign this KPI.")
        user_ids = set(request.data.get("user_ids", []))

        # Validate all users are in the org.
        valid = set(map(str, User.objects.filter(
            id__in=user_ids, organisation_id=request.user.organisation_id
        ).values_list("id", flat=True)))
        if valid != set(map(str, user_ids)):
            raise PermissionDenied("One or more users are not in your organisation.")

        existing = {str(a.user_id): a for a in KPIAssignment.objects.filter(kpi=kpi)}
        # Add / reactivate.
        for uid in user_ids:
            a = existing.get(str(uid))
            if a:
                if not a.is_active:
                    a.is_active = True
                    a.save(update_fields=["is_active"])
            else:
                KPIAssignment.objects.create(kpi=kpi, user_id=uid, assigned_by=request.user)
        # Deactivate removed ones (keep row for history rather than hard-delete).
        for uid, a in existing.items():
            if uid not in set(map(str, user_ids)) and a.is_active:
                a.is_active = False
                a.save(update_fields=["is_active"])

        return Response({"success": True, "assignees": len(user_ids)})