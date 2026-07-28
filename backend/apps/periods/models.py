"""Reporting Period models."""
from django.db import models, transaction
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PeriodStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    OPEN = "OPEN", "Open for Entry"
    CLOSED = "CLOSED", "Closed"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    APPROVED = "APPROVED", "Approved"
    LOCKED = "LOCKED", "Locked"
    REOPENED = "REOPENED", "Reopened"


class ReportingPeriod(UUIDPrimaryKeyMixin, TimestampMixin):
    """Defines a reporting period (week, month, quarter, year)."""
    
    period_type = models.CharField(
        max_length=20,
        choices=[
            ("WEEKLY", "Weekly"),
            ("MONTHLY", "Monthly"),
            ("QUARTERLY", "Quarterly"),
            ("ANNUAL", "Annual"),
        ],
        db_index=True,
    )
    label = models.CharField(max_length=100, help_text="e.g., 'Week 26, 22-28 June 2026'")
    start_date = models.DateField()
    end_date = models.DateField()
    reporting_year = models.IntegerField()
    week_number = models.IntegerField(null=True, blank=True)
    month = models.IntegerField(null=True, blank=True)
    quarter = models.IntegerField(null=True, blank=True)
    
    status = models.CharField(
        max_length=20,
        choices=PeriodStatus.choices,
        default=PeriodStatus.OPEN,
        db_index=True,
    )
    
    submission_deadline = models.DateTimeField(null=True, blank=True)
    locked_date = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="locked_periods",
    )
    reopened_date = models.DateTimeField(null=True, blank=True)
    reopened_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reopened_periods",
    )
    reopen_reason = models.TextField(blank=True)
    
    notes = models.TextField(blank=True)

    
    
    def _get_assigned_users(self, kpi):
        """Get ALL assigned users for a KPI from KPIAssignment table."""
        try:
            from apps.kpis.models import KPIAssignment
            assignments = KPIAssignment.objects.filter(kpi=kpi, is_active=True).select_related('user')
            return [a.user for a in assignments]
        except Exception:
            return []

    def _get_assigned_user(self, kpi):
        """Get the assigned user for a KPI from KPIAssignment."""
        try:
            from apps.kpis.models import KPIAssignment
            assignment = KPIAssignment.objects.filter(kpi=kpi, is_active=True).first()
            return assignment.user if assignment else kpi.responsible_person
        except Exception:
            return kpi.responsible_person

    class Meta:
        db_table = "reporting_periods"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["period_type", "reporting_year", "week_number"],
                name="unique_weekly_period",
                condition=models.Q(period_type="WEEKLY"),
            ),
            models.UniqueConstraint(
                fields=["period_type", "reporting_year", "month"],
                name="unique_monthly_period",
                condition=models.Q(period_type="MONTHLY"),
            ),
            models.UniqueConstraint(
                fields=["period_type", "reporting_year", "quarter"],
                name="unique_quarterly_period",
                condition=models.Q(period_type="QUARTERLY"),
            ),
        ]
        indexes = [
            models.Index(fields=["period_type", "reporting_year"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.get_period_type_display()} - {self.label}"

    def open_period(self, user=None):
        """Open period for data entry and auto-create KPI results."""
        self.status = PeriodStatus.OPEN
        self.save()
        created = self.create_kpi_results()
        return created

    @transaction.atomic
    def create_kpi_results(self):
        """Auto-create empty KPI results for all applicable KPIs in this period."""
        from apps.kpis.models import KPI
        from apps.results.models import KPIResult
        
        kpis = KPI.objects.filter(
            reporting_frequency=self.period_type,
            is_active=True,
        )
        
        created = 0
        for kpi in kpis:
            _, was_created = KPIResult.objects.get_or_create(
                    kpi=kpi,
                    department=kpi.department,
                    reporting_period=self,
                    responsible_person=self._get_assigned_user(kpi),
                defaults={
                    'target_value': kpi.target_value,
                    'calculation_direction': kpi.calculation_direction,
                    'warning_threshold': kpi.warning_threshold,
                    'period_type': self.period_type,
                    'period_label': self.label,
                    'period_start_date': self.start_date,
                    'period_end_date': self.end_date,
                    'reporting_year': self.reporting_year,
                    'week_number': self.week_number,
                    'month': self.month,
                    'quarter': self.quarter,
                    'responsible_person': self._get_assigned_user(kpi),
                }
            )
            if was_created:
                created += 1
        
        return created

    def lock_period(self, user=None):
        """Lock the period."""
        from django.utils import timezone
        self.status = PeriodStatus.LOCKED
        self.locked_date = timezone.now()
        self.locked_by = user
        self.save()

    def reopen_period(self, user=None, reason=""):
        """Reopen a locked period."""
        from django.utils import timezone
        self.status = PeriodStatus.REOPENED
        self.reopened_date = timezone.now()
        self.reopened_by = user
        self.reopen_reason = reason
        self.save()


class DepartmentPeriodScore(TimestampMixin):
    """Cached department score for a reporting period."""
    department = models.ForeignKey(
        "organisation.Department",
        on_delete=models.CASCADE,
        related_name="period_scores",
    )
    reporting_period = models.ForeignKey(
        ReportingPeriod,
        on_delete=models.CASCADE,
        related_name="department_scores",
    )
    average_achievement = models.DecimalField(
        max_digits=8, decimal_places=2,
        null=True, blank=True,
    )
    composite_score = models.DecimalField(
        max_digits=8, decimal_places=2,
        null=True, blank=True,
    )
    kpi_count = models.IntegerField(default=0)
    submitted_count = models.IntegerField(default=0)
    on_track_count = models.IntegerField(default=0)
    at_risk_count = models.IntegerField(default=0)
    off_track_count = models.IntegerField(default=0)
    no_data_count = models.IntegerField(default=0)
    rag_status = models.CharField(max_length=20, blank=True)

    
    
    def _get_assigned_users(self, kpi):
        """Get ALL assigned users for a KPI from KPIAssignment table."""
        try:
            from apps.kpis.models import KPIAssignment
            assignments = KPIAssignment.objects.filter(kpi=kpi, is_active=True).select_related('user')
            return [a.user for a in assignments]
        except Exception:
            return []

    def _get_assigned_user(self, kpi):
        """Get the assigned user for a KPI from KPIAssignment."""
        try:
            from apps.kpis.models import KPIAssignment
            assignment = KPIAssignment.objects.filter(kpi=kpi, is_active=True).first()
            return assignment.user if assignment else kpi.responsible_person
        except Exception:
            return kpi.responsible_person

    class Meta:
        db_table = "department_period_scores"
        unique_together = ["department", "reporting_period"]








