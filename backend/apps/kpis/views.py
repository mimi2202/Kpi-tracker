"""KPI views - RBAC enforced."""
from core.organisation_mixins import OrganisationScopedMixin
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from .models import KPI
from .serializers import KPISerializer, KPIListSerializer
from apps.accounts.permissions import IsAdminOrTeamLeader


class KPIViewSet(OrganisationScopedMixin, viewsets.ModelViewSet):
    org_lookup = 'department__organisation'
    org_save_field = None
    queryset = KPI.objects.select_related("department", "responsible_person").prefetch_related("thresholds")
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["department", "reporting_frequency", "calculation_direction", "is_active"]
    search_fields = ["code", "name", "description"]
    ordering_fields = ["code", "name", "display_order", "created_at"]
    ordering = ["department__display_order", "display_order"]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "archive", "restore"]:
            return [permissions.IsAuthenticated(), IsAdminOrTeamLeader()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "list":
            return KPIListSerializer
        return KPISerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role == "ADMIN":
            return qs
        elif user.role == "TEAM_LEADER":
            # Team leader sees KPIs from departments they or their team belong to
            team_ids = list(user.team_members.values_list("id", flat=True))
            team_ids.append(user.id)
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(user_id__in=team_ids).values_list("department_id", flat=True)
            return qs.filter(department_id__in=dept_ids)
        else:
            # Members see only KPIs from their departments
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(user=user).values_list("department_id", flat=True)
            return qs.filter(department_id__in=dept_ids)

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        kpi = self.get_object()
        kpi.is_active = False
        kpi.save()
        return Response({"success": True, "message": "KPI archived."})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        kpi = self.get_object()
        kpi.is_active = True
        kpi.save()
        return Response({"success": True, "message": "KPI restored."})



