# backend/apps/kpis/models.py
"""KPI definition models."""
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin, SoftDeleteMixin


class CalculationDirection(models.TextChoices):
    """How achievement is calculated."""
    HIGHER_IS_BETTER = "HIGHER_IS_BETTER", "Higher is Better"
    LOWER_IS_BETTER = "LOWER_IS_BETTER", "Lower is Better"
    EXACT_TARGET = "EXACT_TARGET", "Exact Target"
    RANGE = "RANGE", "Range"
    BOOLEAN = "BOOLEAN", "Boolean (Yes/No)"
    MANUAL_SCORE = "MANUAL_SCORE", "Manual Score"


class ReportingFrequency(models.TextChoices):
    """How often the KPI is reported."""
    WEEKLY = "WEEKLY", "Weekly"
    MONTHLY = "MONTHLY", "Monthly"
    QUARTERLY = "QUARTERLY", "Quarterly"
    ANNUAL = "ANNUAL", "Annual"


class UnitType(models.TextChoices):
    """Unit of measurement."""
    PERCENTAGE = "PERCENTAGE", "Percentage (%)"
    NUMBER = "NUMBER", "Number / Count"
    CURRENCY = "CURRENCY", "Currency"
    HOURS = "HOURS", "Hours"
    DAYS = "DAYS", "Days"
    SCORE = "SCORE", "Score"
    RATIO = "RATIO", "Ratio"
    BOOLEAN = "BOOLEAN", "Yes / No"
    CUSTOM = "CUSTOM", "Custom Unit"


class KPI(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Master KPI definition."""
    
    # Identification
    code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    
    # Classification
    department = models.ForeignKey(
        "organisation.Department",
        on_delete=models.PROTECT,
        related_name="kpis",
    )
    calculation_direction = models.CharField(
        max_length=20,
        choices=CalculationDirection.choices,
        default=CalculationDirection.HIGHER_IS_BETTER,
    )
    reporting_frequency = models.CharField(
        max_length=20,
        choices=ReportingFrequency.choices,
        default=ReportingFrequency.MONTHLY,
    )
    unit_type = models.CharField(
        max_length=20,
        choices=UnitType.choices,
        default=UnitType.PERCENTAGE,
    )
    custom_unit = models.CharField(max_length=50, blank=True)
    
    # Targets
    target_value = models.DecimalField(
        max_digits=15, decimal_places=4,
        help_text="Target value for the KPI",
    )
    min_acceptable = models.DecimalField(
        max_digits=15, decimal_places=4, null=True, blank=True,
        help_text="Minimum acceptable value (for RANGE type)",
    )
    max_acceptable = models.DecimalField(
        max_digits=15, decimal_places=4, null=True, blank=True,
        help_text="Maximum acceptable value (for RANGE type)",
    )
    
    # Thresholds
    warning_threshold = models.DecimalField(
        max_digits=5, decimal_places=4, default=0.85,
        help_text="Warning threshold as decimal (e.g., 0.85 = 85%)",
    )
    critical_threshold = models.DecimalField(
        max_digits=5, decimal_places=4, default=0.75,
        help_text="Critical threshold as decimal",
    )
    
    # Configuration
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    weight = models.DecimalField(
        max_digits=5, decimal_places=2, default=1.00,
        help_text="KPI weight for weighted scoring (1.00 = standard)",
    )
    decimal_precision = models.IntegerField(default=1)
    allow_exceed_target = models.BooleanField(
        default=False,
        help_text="Allow achievement above 100%",
    )
    cap_achievement = models.BooleanField(
        default=True,
        help_text="Cap achievement at 100%",
    )
    zero_is_valid = models.BooleanField(
        default=True,
        help_text="Is zero a valid actual result?",
    )
    is_cumulative = models.BooleanField(
        default=False,
        help_text="Does this KPI accumulate over periods?",
    )
    
    # Responsibility
    responsible_person = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="responsible_kpis",
    )
    department_owner = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_kpis",
        help_text="Department-level owner",
    )
    
    # Metadata
    data_source = models.TextField(blank=True, help_text="Where the data comes from")
    evidence_required = models.BooleanField(default=False)
    evidence_description = models.TextField(blank=True)
    requires_approval = models.BooleanField(default=False)
    contributes_to_average = models.BooleanField(default=True)
    
    # Dates
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    
    # Notes
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "kpis"
        verbose_name = "KPI"
        verbose_name_plural = "KPIs"
        ordering = ["department__display_order", "display_order", "name"]

    def __str__(self):
        return f"{self.code} - {self.name}"

    @property
    def unit_display(self):
        """Get display unit."""
        if self.unit_type == UnitType.CUSTOM and self.custom_unit:
            return self.custom_unit
        return self.get_unit_type_display()

    @property
    def direction_icon(self):
        """Get direction icon for display."""
        icons = {
            CalculationDirection.HIGHER_IS_BETTER: "↑",
            CalculationDirection.LOWER_IS_BETTER: "↓",
            CalculationDirection.EXACT_TARGET: "=",
            CalculationDirection.RANGE: "↔",
            CalculationDirection.BOOLEAN: "✓",
            CalculationDirection.MANUAL_SCORE: "✍",
        }
        return icons.get(self.calculation_direction, "?")


class KPIThreshold(TimestampMixin):
    """Per-KPI threshold overrides for specific periods or conditions."""
    kpi = models.ForeignKey(KPI, on_delete=models.CASCADE, related_name="thresholds")
    name = models.CharField(max_length=200)
    warning_threshold = models.DecimalField(max_digits=5, decimal_places=4)
    critical_threshold = models.DecimalField(max_digits=5, decimal_places=4)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "kpi_thresholds"
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.kpi.code} - {self.name}"
  # apps/kpis/models.py (or a new assignments app)
class KPIAssignment(UUIDPrimaryKeyMixin, TimestampMixin):
    kpi = models.ForeignKey(
        "kpis.KPI",
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="kpi_assignments",
    )
    assigned_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="assignments_made",
    )
    is_active = models.BooleanField(default=True, db_index=True)
 
    class Meta:
        db_table = "kpi_assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["kpi", "user"],
                name="unique_kpi_user_assignment",
            ),
        ]
        indexes = [
            models.Index(fields=["kpi", "is_active"]),
            models.Index(fields=["user", "is_active"]),
        ]
 
    def __str__(self):
        return f"{self.kpi.code} -> {self.user.full_name}"

class KPIPresetCategory(UUIDPrimaryKeyMixin, TimestampMixin):
    """A grouping of preset KPIs (e.g. Sales, Support, Operations, General).
    Org-scoped so each organisation curates its own catalogue."""
    organisation = models.ForeignKey(
    "accounts.Organisation",
    on_delete=models.CASCADE,
    related_name="kpi_preset_categories",
)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True)
    icon = models.CharField(max_length=40, blank=True, help_text="lucide icon name, optional")
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
 
    class Meta:
        db_table = "kpi_preset_categories"
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "name"],
                name="unique_org_preset_category_name",
            ),
        ]
 
    def __str__(self):
        return self.name
 
 
class KPIPreset(UUIDPrimaryKeyMixin, TimestampMixin):
    """A reusable KPI template. Cloned into a real KPI when applied to a department."""
    organisation = models.ForeignKey(
    "accounts.Organisation",
    on_delete=models.CASCADE,
    related_name="kpi_presets",
)
    category = models.ForeignKey(
        KPIPresetCategory,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="presets",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
 
    # KPI definition fields — mirror your KPI model so cloning is 1:1.
    # VERIFY these names/choices against your actual KPI model and adjust.
    target_value = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    unit = models.CharField(max_length=40, blank=True, help_text="e.g. %, hrs, count, $")
    calculation_direction = models.CharField(
        max_length=20,
        default="HIGHER_BETTER",
        help_text="HIGHER_BETTER / LOWER_BETTER / etc — match your KPI choices",
    )
    reporting_frequency = models.CharField(
        max_length=20,
        default="MONTHLY",
        help_text="WEEKLY / MONTHLY / QUARTERLY / ANNUAL",
    )
    warning_threshold = models.DecimalField(max_digits=6, decimal_places=4, default=0.85)
 
    is_active = models.BooleanField(default=True)
 
    class Meta:
        db_table = "kpi_presets"
        ordering = ["category__display_order", "name"]
        indexes = [
            models.Index(fields=["organisation", "is_active"]),
            models.Index(fields=["category"]),
        ]
 
    def __str__(self):
        return self.name