# backend/apps/kpis/serializers.py
"""KPI serializers."""
from rest_framework import serializers
from .models import KPI, KPIThreshold


class KPIThresholdSerializer(serializers.ModelSerializer):
    """KPI Threshold serializer."""
    class Meta:
        model = KPIThreshold
        fields = [
            "id", "name", "warning_threshold", "critical_threshold",
            "start_date", "end_date", "is_active",
        ]
        read_only_fields = ["id"]


class KPISerializer(serializers.ModelSerializer):
    """Full KPI serializer (handles create + update)."""
    thresholds = KPIThresholdSerializer(many=True, read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    direction_display = serializers.CharField(source="get_calculation_direction_display", read_only=True)
    frequency_display = serializers.CharField(source="get_reporting_frequency_display", read_only=True)
    unit_display = serializers.CharField(read_only=True)
    responsible_name = serializers.CharField(source="responsible_person.full_name", read_only=True)

    class Meta:
        model = KPI
        fields = [
            "id", "code", "name", "description", "department", "department_name",
            "calculation_direction", "direction_display",
            "reporting_frequency", "frequency_display",
            "unit_type", "unit_display", "custom_unit",
            "target_value", "min_acceptable", "max_acceptable",
            "warning_threshold", "critical_threshold",
            "is_active", "display_order", "weight",
            "decimal_precision", "allow_exceed_target", "cap_achievement",
            "zero_is_valid", "is_cumulative",
            "responsible_person", "responsible_name",
            "department_owner", "data_source",
            "evidence_required", "evidence_description",
            "requires_approval", "contributes_to_average",
            "start_date", "end_date", "notes", "thresholds",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "unit_display"]

    def validate_department(self, department):
        """A KPI can only be attached to a department in the caller's organisation.
        This is the write-side guard the queryset filter can't provide, since the
        client chooses the department id on create/update."""
        request = self.context.get("request")
        if request and department.organisation_id != request.user.organisation_id:
            raise serializers.ValidationError("Department is not in your organisation.")
        return department

    def validate_responsible_person(self, person):
        """Responsible person must also belong to the caller's organisation."""
        request = self.context.get("request")
        if request and person and person.organisation_id != request.user.organisation_id:
            raise serializers.ValidationError("Responsible person is not in your organisation.")
        return person


class KPIListSerializer(serializers.ModelSerializer):
    """Simplified KPI list serializer (read-only)."""
    department_name = serializers.CharField(source="department.name", read_only=True)
    department_colour = serializers.CharField(source="department.colour", read_only=True)
    direction_display = serializers.CharField(source="get_calculation_direction_display", read_only=True)
    unit_display = serializers.CharField(read_only=True)

    class Meta:
        model = KPI
        fields = [
            "id", "code", "name", "department", "department_name",
            "department_colour", "calculation_direction", "direction_display",
            "reporting_frequency", "target_value", "unit_type", "unit_display",
            "is_active", "weight", "requires_approval",
        ]