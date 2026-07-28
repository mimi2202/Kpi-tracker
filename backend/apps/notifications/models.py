"""Notification models."""
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class NotificationType(models.TextChoices):
    KPI_SUBMITTED = "KPI_SUBMITTED", "KPI Result Submitted"
    KPI_APPROVED = "KPI_APPROVED", "KPI Result Approved"
    KPI_RETURNED = "KPI_RETURNED", "KPI Result Returned"
    KPI_AT_RISK = "KPI_AT_RISK", "KPI At Risk"
    KPI_OFF_TRACK = "KPI_OFF_TRACK", "KPI Off Track"
    PERIOD_OPENED = "PERIOD_OPENED", "Period Opened"
    PERIOD_CLOSING = "PERIOD_CLOSING", "Period Closing Soon"
    PERIOD_CLOSED = "PERIOD_CLOSED", "Period Closed"
    PERIOD_SUMMARY = "PERIOD_SUMMARY", "Period Summary"
    MEMBER_ADDED = "MEMBER_ADDED", "Team Member Added"
    ROLE_CHANGED = "ROLE_CHANGED", "Role Changed"
    CORRECTIVE_ACTION = "CORRECTIVE_ACTION", "Corrective Action Required"
    COMMENT_ADDED = "COMMENT_ADDED", "Comment Added"


class Notification(UUIDPrimaryKeyMixin, TimestampMixin):
    """User notification."""
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
    )
    title = models.CharField(max_length=300)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, help_text="Frontend URL to navigate to")
    
    # Optional references
    kpi_result = models.ForeignKey(
        "results.KPIResult",
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    period = models.ForeignKey(
        "periods.ReportingPeriod",
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    is_emailed = models.BooleanField(default=False)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["notification_type"]),
        ]

    def __str__(self):
        return f"{self.get_notification_type_display()} - {self.user}"

    def mark_as_read(self):
        from django.utils import timezone
        self.is_read = True
        self.read_at = timezone.now()
        self.save(update_fields=["is_read", "read_at"])
