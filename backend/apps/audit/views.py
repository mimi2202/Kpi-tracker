"""Audit trail — read-only, admin visibility only. Everything here is
written elsewhere in the app via core.audit.log_action; this view never
creates entries, only lists them.
"""
from rest_framework import viewsets, permissions

from apps.accounts.models import Role
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.role != Role.ADMIN:
            return AuditLog.objects.none()
        return AuditLog.objects.filter(organisation_id=user.organisation_id).select_related("user")