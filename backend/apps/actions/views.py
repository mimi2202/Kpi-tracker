"""Corrective Action views."""
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from .models import CorrectiveAction
from .serializers import CorrectiveActionSerializer, CorrectiveActionCloseSerializer


class CorrectiveActionViewSet(viewsets.ModelViewSet):
    """Corrective Action management."""
    queryset = CorrectiveAction.objects.select_related(
        "kpi_result__kpi", "department", "action_owner"
    )
    serializer_class = CorrectiveActionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["department", "status", "priority", "action_owner"]

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close a corrective action."""
        action_obj = self.get_object()
        serializer = CorrectiveActionCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        action_obj.status = "CLOSED"
        action_obj.closure_date = timezone.now()
        action_obj.closure_notes = serializer.validated_data.get("closure_notes", "")
        action_obj.effectiveness_review = serializer.validated_data.get("effectiveness_review", "")
        action_obj.completion_percentage = 100
        action_obj.reviewer = request.user
        action_obj.save()
        
        return Response({"success": True, "message": "Action closed."})

    @action(detail=True, methods=["post"])
    def update_progress(self, request, pk=None):
        """Update completion percentage."""
        action_obj = self.get_object()
        percentage = request.data.get("completion_percentage", 0)
        
        action_obj.completion_percentage = min(max(int(percentage), 0), 100)
        if action_obj.completion_percentage > 0 and action_obj.status == "OPEN":
            action_obj.status = "IN_PROGRESS"
        action_obj.save()
        
        return Response({"success": True, "completion_percentage": action_obj.completion_percentage})

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by KPI result
        result_id = self.request.query_params.get("kpi_result")
        if result_id:
            queryset = queryset.filter(kpi_result_id=result_id)
        
        # Filter overdue
        overdue = self.request.query_params.get("overdue")
        if overdue:
            from datetime import date
            queryset = queryset.filter(
                status__in=["OPEN", "IN_PROGRESS"],
                due_date__lt=date.today(),
            )
        
        return queryset