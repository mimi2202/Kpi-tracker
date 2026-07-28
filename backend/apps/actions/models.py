"""Corrective Action models."""
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ActionPriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class ActionStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    AWAITING_EVIDENCE = "AWAITING_EVIDENCE", "Awaiting Evidence"
    AWAITING_REVIEW = "AWAITING_REVIEW", "Awaiting Review"
    CLOSED = "CLOSED", "Closed"
    CANCELLED = "CANCELLED", "Cancelled"
    OVERDUE = "OVERDUE", "Overdue"


class CorrectiveAction(UUIDPrimaryKeyMixin, TimestampMixin):
    """Corrective action linked to KPI results."""
    
    action_number = models.CharField(max_length=50, unique=True, blank=True)
    kpi_result = models.ForeignKey(
        "results.KPIResult",
        on_delete=models.CASCADE,
        related_name="corrective_actions",
    )
    department = models.ForeignKey(
        "organisation.Department",
        on_delete=models.PROTECT,
        related_name="corrective_actions",
    )
    
    problem_statement = models.TextField()
    root_cause = models.TextField(blank=True)
    corrective_action = models.TextField()
    preventive_action = models.TextField(blank=True)
    
    action_owner = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_actions",
    )
    priority = models.CharField(
        max_length=10,
        choices=ActionPriority.choices,
        default=ActionPriority.MEDIUM,
    )
    status = models.CharField(
        max_length=25,
        choices=ActionStatus.choices,
        default=ActionStatus.OPEN,
        db_index=True,
    )
    
    date_raised = models.DateField(auto_now_add=True)
    due_date = models.DateField(null=True, blank=True)
    completion_percentage = models.IntegerField(default=0)
    
    reviewer = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reviewed_actions",
    )
    closure_date = models.DateTimeField(null=True, blank=True)
    closure_notes = models.TextField(blank=True)
    effectiveness_review = models.TextField(blank=True)
    
    class Meta:
        db_table = "corrective_actions"
        ordering = ["-date_raised"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["department"]),
        ]

    def __str__(self):
        return f"{self.action_number} - {self.problem_statement[:50]}"

    def save(self, *args, **kwargs):
        if not self.action_number:
            from datetime import datetime
            prefix = "CA"
            year = datetime.now().strftime("%y")
            count = CorrectiveAction.objects.filter(
                date_raised__year=datetime.now().year
            ).count() + 1
            self.action_number = f"{prefix}-{year}-{count:04d}"
        
        # Auto-mark overdue
        if self.due_date and self.status not in ["CLOSED", "CANCELLED"]:
            from datetime import date
            if self.due_date < date.today():
                self.status = ActionStatus.OVERDUE
        
        super().save(*args, **kwargs)