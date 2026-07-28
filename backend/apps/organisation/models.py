# backend/apps/organisation/models.py
"""Department and Organisation models."""
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin, SoftDeleteMixin


class Department(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Organisational department — belongs to an organisation."""
    organisation = models.ForeignKey(
        "accounts.Organisation",
        on_delete=models.CASCADE,
        related_name="departments",
        null=True, blank=True,
    )
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, help_text="Short code e.g. OPS, BD")
    description = models.TextField(blank=True)
    colour = models.CharField(max_length=7, default="#3B82F6")
    department_head = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="headed_departments",
    )
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    
    weekly_reporting = models.BooleanField(default=True)
    monthly_reporting = models.BooleanField(default=True)
    quarterly_reporting = models.BooleanField(default=True)
    annual_reporting = models.BooleanField(default=True)

    class Meta:
        db_table = "departments"
        ordering = ["display_order", "name"]
        unique_together = ["organisation", "code"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def kpi_count(self):
        return self.kpis.filter(is_active=True).count()


class UserDepartment(TimestampMixin):
    """Link users to departments."""
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="department_links")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="user_links")
    is_department_head = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False)

    class Meta:
        db_table = "user_departments"
        unique_together = ["user", "department"]

    def __str__(self):
        return f"{self.user} - {self.department}"