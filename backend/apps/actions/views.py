"""Corrective Action views."""
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.models import Role
from .models import CorrectiveAction
from .serializers import CorrectiveActionSerializer, CorrectiveActionCloseSerializer
from core.audit import log_action


class CorrectiveActionViewSet(viewsets.ModelViewSet):
    """Corrective Action management."""
    queryset = CorrectiveAction.objects.select_related(
        "kpi_result__kpi", "department", "action_owner"
    )
    serializer_class = CorrectiveActionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["department", "status", "priority", "action_owner"]

    def get_queryset(self):
        """Scoped by organisation first, always, then by role:
        admin sees the whole org, a team leader sees only actions in
        departments they head, everyone else sees only actions assigned to them.
        Previously this had no scoping at all — any authenticated user could
        see every action for every department.
        """
        user = self.request.user
        queryset = super().get_queryset().filter(department__organisation_id=user.organisation_id)

        if user.role == Role.ADMIN:
            pass
        elif user.role == Role.TEAM_LEADER:
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(
                user=user, is_department_head=True
            ).values_list("department_id", flat=True)
            queryset = queryset.filter(department_id__in=dept_ids)
        else:
            queryset = queryset.filter(action_owner=user)

        result_id = self.request.query_params.get("kpi_result")
        if result_id:
            queryset = queryset.filter(kpi_result_id=result_id)

        overdue = self.request.query_params.get("overdue")
        if overdue:
            from datetime import date
            queryset = queryset.filter(
                status__in=["OPEN", "IN_PROGRESS"],
                due_date__lt=date.today(),
            )

        return queryset

    def _can_manage(self, action_obj, user):
        if user.role == Role.ADMIN:
            return action_obj.department.organisation_id == user.organisation_id
        if user.role == Role.TEAM_LEADER:
            from apps.organisation.models import UserDepartment
            return UserDepartment.objects.filter(
                user=user, is_department_head=True, department_id=action_obj.department_id
            ).exists()
        return False

    def perform_create(self, serializer):
        department = serializer.validated_data.get("department")
        user = self.request.user

        if user.role == Role.ADMIN:
            if department.organisation_id != user.organisation_id:
                raise PermissionDenied("Department is not in your organisation.")
        elif user.role == Role.TEAM_LEADER:
            from apps.organisation.models import UserDepartment
            if not UserDepartment.objects.filter(
                user=user, is_department_head=True, department_id=department.id
            ).exists():
                raise PermissionDenied("You can only raise actions for departments you lead.")
        else:
            raise PermissionDenied("Only admins and team leaders can raise corrective actions.")

        action_obj = serializer.save()
        self._notify_owner_assigned(action_obj)
        log_action(user, "Raised Corrective Action", action_obj.action_number)

    def perform_update(self, serializer):
        obj = serializer.instance
        user = self.request.user
        if not self._can_manage(obj, user):
            raise PermissionDenied("You can't edit this action.")

        old_owner_id = obj.action_owner_id
        action_obj = serializer.save()
        if action_obj.action_owner_id and action_obj.action_owner_id != old_owner_id:
            self._notify_owner_assigned(action_obj)

    def perform_destroy(self, instance):
        if not self._can_manage(instance, self.request.user):
            raise PermissionDenied("You can't delete this action.")
        instance.delete()

    def _notify_owner_assigned(self, action_obj):
        try:
            from apps.notifications.models import Notification, NotificationType
            from core.email import send_notification_email

            if not action_obj.action_owner:
                return

            message = f"{action_obj.action_number}: {action_obj.problem_statement[:100]}"
            Notification.objects.create(
                user=action_obj.action_owner,
                notification_type=NotificationType.CORRECTIVE_ACTION,
                title="Corrective Action Assigned",
                message=message,
                link=f"/actions?open={action_obj.id}",
            )
            send_notification_email(
                action_obj.action_owner,
                subject=f"Corrective Action Assigned: {action_obj.action_number}",
                message_lines=[message],
            )
        except Exception:
            import traceback
            traceback.print_exc()

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Closing is a review action, reserved for admins and team leaders,
        not the assigned owner, matching the KPI approval pattern."""
        action_obj = self.get_object()
        if not self._can_manage(action_obj, request.user):
            return Response({"success": False, "error": "Only admins and team leaders can close actions."}, status=403)

        serializer = CorrectiveActionCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_obj.status = "CLOSED"
        action_obj.closure_date = timezone.now()
        action_obj.closure_notes = serializer.validated_data.get("closure_notes", "")
        action_obj.effectiveness_review = serializer.validated_data.get("effectiveness_review", "")
        action_obj.completion_percentage = 100
        action_obj.reviewer = request.user
        action_obj.save()
        log_action(request.user, "Closed Corrective Action", action_obj.action_number)

        return Response({"success": True, "message": "Action closed."})

    @action(detail=True, methods=["post"])
    def update_progress(self, request, pk=None):
        """Update completion percentage. The assigned owner or a manager can do this."""
        action_obj = self.get_object()
        user = request.user
        if action_obj.action_owner_id != user.id and not self._can_manage(action_obj, user):
            return Response({"success": False, "error": "You can only update your own actions."}, status=403)

        percentage = request.data.get("completion_percentage", 0)
        action_obj.completion_percentage = min(max(int(percentage), 0), 100)
        if action_obj.completion_percentage > 0 and action_obj.status == "OPEN":
            action_obj.status = "IN_PROGRESS"
        action_obj.save()

        return Response({"success": True, "completion_percentage": action_obj.completion_percentage})