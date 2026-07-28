"""Period serializers."""
from rest_framework import serializers
from .models import ReportingPeriod, DepartmentPeriodScore


class ReportingPeriodSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    period_type_display = serializers.CharField(source="get_period_type_display", read_only=True)
    period_label = serializers.CharField(source="label", read_only=True)

    class Meta:
        model = ReportingPeriod
        fields = [
            "id", "period_type", "period_type_display",
            "label", "period_label",
            "start_date", "end_date", "reporting_year",
            "week_number", "month", "quarter",
            "status", "status_display",
            "submission_deadline", "locked_date", "reopened_date",
            "reopen_reason", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "locked_date", "reopened_date", "created_at", "updated_at"]


class PeriodActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class DepartmentPeriodScoreSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    department_colour = serializers.CharField(source="department.colour", read_only=True)
    period_label = serializers.CharField(source="reporting_period.label", read_only=True)

    class Meta:
        model = DepartmentPeriodScore
        fields = [
            "id", "department", "department_name", "department_colour",
            "reporting_period", "period_label",
            "average_achievement", "composite_score",
            "kpi_count", "submitted_count",
            "on_track_count", "at_risk_count", "off_track_count",
            "no_data_count", "rag_status",
            "created_at", "updated_at",
        ]
