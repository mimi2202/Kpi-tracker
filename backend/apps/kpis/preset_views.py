# apps/kpis/preset_views.py
"""Preset KPI catalogue: browse, edit (admin/leader), and apply to a department."""
from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from decimal import Decimal

from apps.accounts.models import Role
from apps.kpis.models import KPI, KPIPreset, KPIPresetCategory
from apps.organisation.models import Department


# ---------------- serializers ----------------
class KPIPresetCategorySerializer(serializers.ModelSerializer):
    preset_count = serializers.SerializerMethodField()

    class Meta:
        model = KPIPresetCategory
        fields = ["id", "name", "description", "icon", "display_order", "is_active", "preset_count"]
        read_only_fields = ["id", "preset_count"]

    def get_preset_count(self, obj):
        return obj.presets.filter(is_active=True).count()


class KPIPresetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default="")

    class Meta:
        model = KPIPreset
        fields = [
            "id", "name", "description", "category", "category_name",
            "target_value", "unit", "calculation_direction",
            "reporting_frequency", "warning_threshold", "is_active",
        ]
        read_only_fields = ["id", "category_name"]


def _require_manage(user):
    if user.role not in [Role.ADMIN, Role.TEAM_LEADER]:
        raise PermissionDenied("Only admins and team leaders can manage presets.")


# ---------------- viewsets ----------------
class KPIPresetCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = KPIPresetCategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return KPIPresetCategory.objects.filter(
            organisation_id=self.request.user.organisation_id
        )

    def perform_create(self, serializer):
        _require_manage(self.request.user)
        serializer.save(organisation_id=self.request.user.organisation_id)

    def perform_update(self, serializer):
        _require_manage(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        _require_manage(self.request.user)
        instance.delete()


class KPIPresetViewSet(viewsets.ModelViewSet):
    serializer_class = KPIPresetSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["category", "is_active", "reporting_frequency"]

    def get_queryset(self):
        return KPIPreset.objects.filter(
            organisation_id=self.request.user.organisation_id
        ).select_related("category")

    def perform_create(self, serializer):
        _require_manage(self.request.user)
        serializer.save(organisation_id=self.request.user.organisation_id)

    def perform_update(self, serializer):
        _require_manage(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        _require_manage(self.request.user)
        instance.delete()

    @action(detail=False, methods=["post"])
    def apply(self, request):
        """Clone selected presets into real KPIs in a department.
        Body: { "preset_ids": [...], "department_id": "..." }"""
        _require_manage(request.user)
        department = get_object_or_404(
            Department, id=request.data.get("department_id"),
            organisation_id=request.user.organisation_id,
        )
        preset_ids = request.data.get("preset_ids", [])
        presets = KPIPreset.objects.filter(
            id__in=preset_ids, organisation_id=request.user.organisation_id, is_active=True
        )

        created, skipped = [], []
        for p in presets:
            # Skip if a KPI with the same name already exists in this department.
            if KPI.objects.filter(department=department, name=p.name).exists():
                skipped.append(p.name)
                continue
            # Clone preset -> KPI. VERIFY these field names against your KPI model.
            kpi = KPI.objects.create(
                organisation_id=request.user.organisation_id,
                department=department,
                name=p.name,
                description=p.description,
                target_value=p.target_value,
                unit=p.unit,
                calculation_direction=p.calculation_direction,
                reporting_frequency=p.reporting_frequency,
                warning_threshold=p.warning_threshold,
                is_active=True,
            )
            created.append(kpi.name)

        return Response({
            "success": True,
            "created": created,
            "created_count": len(created),
            "skipped": skipped,
        })