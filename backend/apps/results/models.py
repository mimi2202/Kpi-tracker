"""KPI Result models."""
from django.db import models
from django.core.validators import MinValueValidator
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ResultStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    RETURNED = "RETURNED", "Returned for Revision"
    DEPARTMENT_APPROVED = "DEPARTMENT_APPROVED", "Department Approved"
    QA_APPROVED = "QA_APPROVED", "QA Approved"
    FULLY_APPROVED = "FULLY_APPROVED", "Fully Approved"
    LOCKED = "LOCKED", "Locked"


class KPIResult(UUIDPrimaryKeyMixin, TimestampMixin):
    """Stores actual KPI results for a specific period."""

    kpi = models.ForeignKey(
        "kpis.KPI",
        on_delete=models.PROTECT,
        related_name="results",
    )
    department = models.ForeignKey(
        "organisation.Department",
        on_delete=models.PROTECT,
        related_name="results",
    )

    # Period information
    period_type = models.CharField(max_length=20, choices=[
        ("WEEKLY", "Weekly"),
        ("MONTHLY", "Monthly"),
        ("QUARTERLY", "Quarterly"),
        ("ANNUAL", "Annual"),
    ])
    reporting_period = models.ForeignKey(
        "periods.ReportingPeriod",
        on_delete=models.PROTECT,
        related_name="results",
        null=True, blank=True,
    )
    period_start_date = models.DateField()
    period_end_date = models.DateField()
    period_label = models.CharField(max_length=100)
    reporting_year = models.IntegerField()
    week_number = models.IntegerField(null=True, blank=True)
    month = models.IntegerField(null=True, blank=True)
    quarter = models.IntegerField(null=True, blank=True)

    # Snapshot of KPI definition at time of submission
    target_value = models.DecimalField(max_digits=15, decimal_places=4)
    calculation_direction = models.CharField(max_length=20)
    warning_threshold = models.DecimalField(max_digits=5, decimal_places=4, default=0.85)

    # Actual values
    actual_value = models.DecimalField(
        max_digits=15, decimal_places=4,
        null=True, blank=True,
        help_text="The actual measured value (null = no data submitted)",
    )
    previous_actual_value = models.DecimalField(
        max_digits=15, decimal_places=4,
        null=True, blank=True,
    )

    # Calculated fields (populated by calculation engine on save)
    achievement_percentage = models.DecimalField(
        max_digits=8, decimal_places=2,
        null=True, blank=True,
    )
    variance = models.DecimalField(
        max_digits=15, decimal_places=4,
        null=True, blank=True,
    )
    variance_display = models.CharField(max_length=50, blank=True)
    rag_status = models.CharField(
        max_length=20,
        choices=[
            ("NO_DATA", "No Data"),
            ("ON_TRACK", "On Track"),
            ("AT_RISK", "At Risk"),
            ("OFF_TRACK", "Off Track"),
        ],
        default="NO_DATA",
    )
    trend_status = models.CharField(
        max_length=20,
        choices=[
            ("IMPROVING", "Improving"),
            ("DECLINING", "Declining"),
            ("STABLE", "Stable"),
            ("INSUFFICIENT_DATA", "Insufficient Data"),
            ("NO_DATA", "No Data"),
        ],
        default="NO_DATA",
    )

    # Metadata
    responsible_person = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="responsible_results",
    )
    notes = models.TextField(blank=True)
    corrective_action = models.TextField(blank=True)
    root_cause = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    action_owner = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="action_results",
    )

    # Status & workflow
    submission_status = models.CharField(
        max_length=25,
        choices=ResultStatus.choices,
        default=ResultStatus.DRAFT,
        db_index=True,
    )

    # Submission tracking
    submitted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="submitted_results",
    )
    submitted_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reviewed_results",
    )
    reviewed_date = models.DateTimeField(null=True, blank=True)
    version_number = models.IntegerField(default=1)

    def submit(self, user):
        """Submit result for review."""
        from django.utils import timezone
        self.submission_status = ResultStatus.SUBMITTED
        self.submitted_by = user
        self.submitted_date = timezone.now()
        self.save()

    class Meta:
        db_table = "kpi_results"
        ordering = ["-period_start_date", "department__name", "kpi__display_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["kpi", "reporting_period", "responsible_person"],
                name="unique_kpi_period_result",
            ),
        ]
        indexes = [
            models.Index(fields=["kpi", "reporting_period"]),
            models.Index(fields=["department", "period_type", "reporting_year"]),
            models.Index(fields=["rag_status"]),
            models.Index(fields=["submission_status"]),
        ]

    def __str__(self):
        return f"{self.kpi.code} - {self.period_label}"

    def save(self, *args, **kwargs):
        """Auto-calculate achievement on save if actual value is provided."""
        if self.actual_value is not None:
            self._calculate()
        super().save(*args, **kwargs)

    def _calculate(self):
        """Run calculation engine on this result."""
        from apps.results.calculation import (
            KPICalculationEngine,
            KPIInputData,
            CalculationDirection,
        )

        engine = KPICalculationEngine()

        direction_map = {
            "HIGHER_IS_BETTER": CalculationDirection.HIGHER_IS_BETTER,
            "LOWER_IS_BETTER": CalculationDirection.LOWER_IS_BETTER,
            "EXACT_TARGET": CalculationDirection.EXACT_TARGET,
            "RANGE": CalculationDirection.RANGE,
            "BOOLEAN": CalculationDirection.BOOLEAN,
            "MANUAL_SCORE": CalculationDirection.MANUAL_SCORE,
        }

        direction = direction_map.get(
            self.calculation_direction,
            CalculationDirection.HIGHER_IS_BETTER,
        )

        result = engine.calculate(KPIInputData(
            actual=self.actual_value,
            target=self.target_value,
            previous_actual=self.previous_actual_value,
            direction=direction,
            warning_threshold=self.warning_threshold,
        ))

        self.achievement_percentage = result.achievement_percentage
        self.variance = result.variance
        self.variance_display = result.variance_display
        self.rag_status = result.rag_status.value
        self.trend_status = result.trend_status.value


class KPIResultVersion(TimestampMixin):
    """Immutable version history for KPI results."""
    result = models.ForeignKey(
        KPIResult,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.IntegerField()
    actual_value = models.DecimalField(max_digits=15, decimal_places=4, null=True)
    achievement_percentage = models.DecimalField(max_digits=8, decimal_places=2, null=True)
    rag_status = models.CharField(max_length=20)
    notes = models.TextField(blank=True)
    changed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
    )
    change_reason = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "kpi_result_versions"
        ordering = ["-version_number"]