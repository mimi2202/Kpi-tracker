# backend/apps/organisation/serializers.py
"""Department serializers."""
from rest_framework import serializers
from .models import Department


class DepartmentSerializer(serializers.ModelSerializer):
    """Department CRUD serializer."""
    organisation = serializers.PrimaryKeyRelatedField(read_only=True)
    organisation_name = serializers.CharField(source="organisation.name", read_only=True, default="")
    kpi_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Department
        fields = [
            "id", "name", "code", "description", "colour",
            "organisation", "organisation_name",
            "department_head", "is_active", "display_order",
            "weekly_reporting", "monthly_reporting", "quarterly_reporting",
            "annual_reporting", "kpi_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organisation", "organisation_name", "created_at", "updated_at"]


class DepartmentListSerializer(serializers.ModelSerializer):
    """Simplified department list serializer."""
    kpi_count = serializers.IntegerField(read_only=True)
    department_head_name = serializers.CharField(
        source="department_head.full_name", read_only=True
    )
    organisation_name = serializers.CharField(source="organisation.name", read_only=True, default="")

    class Meta:
        model = Department
        fields = [
            "id", "name", "code", "colour", "organisation_name",
            "department_head_name", "is_active", "kpi_count",
        ]