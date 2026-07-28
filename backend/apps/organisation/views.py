"""Department views."""
from core.organisation_mixins import OrganisationScopedMixin
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import Department, UserDepartment
from .serializers import DepartmentSerializer, DepartmentListSerializer


class DepartmentViewSet(OrganisationScopedMixin, viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    queryset = Department.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()  # org-scoped by the mixin
        if self.action == "list":
            return qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return DepartmentListSerializer if self.action == "list" else DepartmentSerializer

    def _require_manager(self):
        # Server-side enforcement. Hiding the button in the UI is cosmetic;
        # this is what actually stops a member POSTing to /departments/.
        if self.request.user.role not in ("ADMIN", "TEAM_LEADER"):
            raise PermissionDenied("Only admins and team leaders can manage departments.")

    def perform_create(self, serializer):
        self._require_manager()
        super().perform_create(serializer)  # mixin injects organisation

    def perform_update(self, serializer):
        self._require_manager()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_manager()
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        department = self.get_object()
        user_depts = UserDepartment.objects.filter(department=department).select_related("user")
        data = []
        for ud in user_depts:
            u = ud.user
            data.append({
                "id": str(u.id),
                "full_name": u.full_name,
                "email": u.email,
                "role": u.role,
                "role_display": u.get_role_display(),
                "display_title": u.display_title,
                "is_department_head": ud.is_department_head,
                "kpi_progress": u.get_kpi_progress() if hasattr(u, "get_kpi_progress") else None,
            })
        return Response(data)