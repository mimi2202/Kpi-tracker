"""Corrective Action serializers."""
from rest_framework import serializers
from .models import CorrectiveAction


class CorrectiveActionSerializer(serializers.ModelSerializer):
    kpi_code = serializers.CharField(source="kpi_result.kpi.code", read_only=True)
    kpi_name = serializers.CharField(source="kpi_result.kpi.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    action_owner_name = serializers.CharField(source="action_owner.full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = CorrectiveAction
        fields = [
            "id", "action_number", "kpi_result", "kpi_code", "kpi_name",
            "department", "department_name",
            "problem_statement", "root_cause",
            "corrective_action", "preventive_action",
            "action_owner", "action_owner_name",
            "priority", "priority_display",
            "status", "status_display",
            "date_raised", "due_date", "completion_percentage",
            "reviewer", "closure_date", "closure_notes",
            "effectiveness_review", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "action_number", "date_raised", "created_at", "updated_at"]


class CorrectiveActionCloseSerializer(serializers.Serializer):
    """Serializer for closing a corrective action."""
    closure_notes = serializers.CharField(required=False, allow_blank=True)
    effectiveness_review = serializers.CharField(required=False, allow_blank=True)