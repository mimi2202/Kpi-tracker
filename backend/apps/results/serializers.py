"""KPI Result serializers."""
from rest_framework import serializers
from .models import KPIResult, KPIResultVersion


class KPIResultVersionSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True)

    class Meta:
        model = KPIResultVersion
        fields = [
            "id", "version_number", "actual_value", "achievement_percentage",
            "rag_status", "notes", "changed_by", "changed_by_name",
            "change_reason", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class KPIResultSerializer(serializers.ModelSerializer):
    kpi_code = serializers.CharField(source="kpi.code", read_only=True)
    kpi_name = serializers.CharField(source="kpi.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    submitted_by_name = serializers.CharField(source="submitted_by.full_name", read_only=True)
    versions = KPIResultVersionSerializer(many=True, read_only=True)

    class Meta:
        model = KPIResult
        fields = [
            "id", "kpi", "kpi_code", "kpi_name", "department", "department_name",
            "period_type", "reporting_period", "period_start_date", "period_end_date",
            "period_label", "reporting_year", "week_number", "month", "quarter",
            "target_value", "calculation_direction", "warning_threshold",
            "actual_value", "previous_actual_value",
            "achievement_percentage", "variance", "variance_display",
            "rag_status", "trend_status",
            "responsible_person", "notes", "corrective_action",
            "root_cause", "due_date", "action_owner",
            "submission_status", "submitted_by", "submitted_by_name",
            "submitted_date", "reviewed_by", "reviewed_date",
            "version_number", "versions", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "achievement_percentage", "variance", "variance_display",
            "rag_status", "trend_status", "submission_status",
            "submitted_date", "reviewed_date", "version_number",
            "created_at", "updated_at",
        ]


class KPIResultEntrySerializer(serializers.ModelSerializer):
    """Serializer for data entry table with all display fields."""
    kpi_code = serializers.CharField(source="kpi.code", read_only=True)
    kpi_name = serializers.CharField(source="kpi.name", read_only=True)
    target_value_display = serializers.DecimalField(source="target_value", max_digits=15, decimal_places=4, read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default="")
    period_label = serializers.SerializerMethodField()
    responsible_name = serializers.SerializerMethodField()
    rag_display = serializers.SerializerMethodField()
    trend_icon = serializers.SerializerMethodField()
 
    class Meta:
        model = KPIResult
        fields = [
            "id", "kpi", "kpi_code", "kpi_name",
            "department", "department_name",
            "reporting_period", "period_label",
            "target_value", "target_value_display", "actual_value",
            "achievement_percentage", "variance_display",
            "rag_status", "rag_display", "trend_status", "trend_icon",
            "submission_status",
            "responsible_person", "responsible_name",
            "notes", "corrective_action",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "kpi_code", "kpi_name", "target_value_display",
            "department_name", "period_label",
            "achievement_percentage", "variance_display",
            "rag_status", "rag_display", "trend_status", "trend_icon",
            "responsible_name", "created_at", "updated_at",
        ]
 
    def get_period_label(self, obj):
        # Prefer the linked period's label; fall back to the row's own snapshot.
        if obj.reporting_period_id and getattr(obj.reporting_period, "label", None):
            return obj.reporting_period.label
        return obj.period_label or ""
 
    def get_responsible_name(self, obj):
        return obj.responsible_person.full_name if obj.responsible_person_id else ""
 
    def get_rag_display(self, obj):
        mapping = {"ON_TRACK": "On Track", "AT_RISK": "At Risk", "OFF_TRACK": "Off Track", "NO_DATA": "No Data"}
        return mapping.get(obj.rag_status, obj.rag_status)
 
    def get_trend_icon(self, obj):
        mapping = {"IMPROVING": "up", "DECLINING": "down", "STABLE": "right", "NO_DATA": "dash"}
        return mapping.get(obj.trend_status, "dash")



class BulkSaveSerializer(serializers.Serializer):
    results = KPIResultEntrySerializer(many=True)
    period_id = serializers.UUIDField()
    submit = serializers.BooleanField(default=False)

    def create(self, validated_data):
        from django.utils import timezone
        results_data = validated_data["results"]
        period_id = validated_data["period_id"]
        submit = validated_data["submit"]
        saved_results = []
        for result_data in results_data:
            kpi_result, created = KPIResult.objects.update_or_create(
                kpi=result_data["kpi"],
                reporting_period_id=period_id,
                defaults={
                    "actual_value": result_data.get("actual_value"),
                    "responsible_person": result_data.get("responsible_person"),
                    "notes": result_data.get("notes", ""),
                    "corrective_action": result_data.get("corrective_action", ""),
                    "due_date": result_data.get("due_date"),
                    "action_owner": result_data.get("action_owner"),
                    "submission_status": "SUBMITTED" if submit else "DRAFT",
                    "submitted_date": timezone.now() if submit else None,
                    "submitted_by": self.context["request"].user if submit else None,
                },
            )
            saved_results.append(kpi_result)
        return {"saved_count": len(saved_results), "results": saved_results}


class ResultApprovalSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "return", "reject"])
    comment = serializers.CharField(required=False, allow_blank=True)
    return_reason = serializers.CharField(required=False, allow_blank=True)
