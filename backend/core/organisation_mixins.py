"""
Universal organisation-scoping mixin for DRF ViewSets.

Usage:
    # Direct FK
    class DepartmentViewSet(OrganisationScopedMixin, ModelViewSet):
        queryset = Department.objects.all()

    # Indirect FK (via FK chain)
    class KPIViewSet(OrganisationScopedMixin, ModelViewSet):
        queryset = KPI.objects.all()
        org_lookup = "department__organisation"
        org_save_field = None  # org comes via validated FK, not injected

    # Custom queryset
    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list":
            return qs.filter(is_active=True)
        return qs
"""
from rest_framework.exceptions import ValidationError


class OrganisationScopedMixin:
    org_lookup = "organisation"
    org_save_field = "organisation"

    def get_queryset(self):
        qs = super().get_queryset()
        org_id = getattr(self.request.user, "organisation_id", None)
        if not org_id:
            return qs.none()
        return qs.filter(**{self.org_lookup: org_id})

    def perform_create(self, serializer):
        org = getattr(self.request.user, "organisation", None)
        if org is None:
            raise ValidationError("Your account has no organisation. Cannot create records.")
        if self.org_save_field:
            serializer.save(**{self.org_save_field: org})
        else:
            serializer.save()
