# backend/apps/results/calculation.py
"""
CORE CALCULATION ENGINE
Handles all KPI calculations: achievement, variance, RAG status, trend, averages, composites.
All calculations use Decimal for precision.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional, List, Dict


class CalculationDirection(Enum):
    HIGHER_IS_BETTER = "HIGHER_IS_BETTER"
    LOWER_IS_BETTER = "LOWER_IS_BETTER"
    EXACT_TARGET = "EXACT_TARGET"
    RANGE = "RANGE"
    BOOLEAN = "BOOLEAN"
    MANUAL_SCORE = "MANUAL_SCORE"


class RAGStatus(Enum):
    NO_DATA = "NO_DATA"
    ON_TRACK = "ON_TRACK"
    AT_RISK = "AT_RISK"
    OFF_TRACK = "OFF_TRACK"


class TrendStatus(Enum):
    IMPROVING = "IMPROVING"
    DECLINING = "DECLINING"
    STABLE = "STABLE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    NO_DATA = "NO_DATA"


@dataclass
class KPIInputData:
    """Input data for KPI calculation."""
    actual: Optional[Decimal]
    target: Decimal
    previous_actual: Optional[Decimal] = None
    direction: CalculationDirection = CalculationDirection.HIGHER_IS_BETTER
    warning_threshold: Decimal = Decimal("0.85")
    critical_threshold: Decimal = Decimal("0.75")
    min_acceptable: Optional[Decimal] = None
    max_acceptable: Optional[Decimal] = None
    warning_min: Optional[Decimal] = None
    warning_max: Optional[Decimal] = None
    cap_achievement: bool = True
    allow_exceed_100: bool = False
    tolerance: Optional[Decimal] = None  # For exact target tolerance


@dataclass
class CalculationResult:
    """Output of KPI calculation."""
    achievement_percentage: Optional[Decimal]
    variance: Optional[Decimal]
    variance_display: str
    rag_status: RAGStatus
    trend_status: TrendStatus
    rag_display: str = ""
    trend_display: str = ""
    trend_icon: str = ""

    def __post_init__(self):
        self.rag_display = self._get_rag_display()
        self.trend_display = self._get_trend_display()
        self.trend_icon = self._get_trend_icon()

    def _get_rag_display(self) -> str:
        return {
            RAGStatus.NO_DATA: "No Data",
            RAGStatus.ON_TRACK: "On Track",
            RAGStatus.AT_RISK: "At Risk",
            RAGStatus.OFF_TRACK: "Off Track",
        }.get(self.rag_status, "Unknown")

    def _get_trend_display(self) -> str:
        return {
            TrendStatus.IMPROVING: "Improving",
            TrendStatus.DECLINING: "Declining",
            TrendStatus.STABLE: "Stable",
            TrendStatus.INSUFFICIENT_DATA: "Insufficient Data",
            TrendStatus.NO_DATA: "No Data",
        }.get(self.trend_status, "Unknown")

    def _get_trend_icon(self) -> str:
        return {
            TrendStatus.IMPROVING: "↑",
            TrendStatus.DECLINING: "↓",
            TrendStatus.STABLE: "→",
            TrendStatus.INSUFFICIENT_DATA: "◌",
            TrendStatus.NO_DATA: "—",
        }.get(self.trend_status, "?")


class KPICalculationEngine:
    """
    Central calculation engine for all KPI metrics.
    
    Usage:
        engine = KPICalculationEngine()
        result = engine.calculate(KPIInputData(
            actual=Decimal('85'),
            target=Decimal('90'),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
    """

    def calculate(self, data: KPIInputData) -> CalculationResult:
        """
        Main calculation entry point.
        Routes to the appropriate calculation method based on KPI direction.
        """
        if data.actual is None:
            return self._no_data_result(data)

        if data.direction == CalculationDirection.HIGHER_IS_BETTER:
            return self._calculate_higher_better(data)
        elif data.direction == CalculationDirection.LOWER_IS_BETTER:
            return self._calculate_lower_better(data)
        elif data.direction == CalculationDirection.EXACT_TARGET:
            return self._calculate_exact_target(data)
        elif data.direction == CalculationDirection.RANGE:
            return self._calculate_range(data)
        elif data.direction == CalculationDirection.BOOLEAN:
            return self._calculate_boolean(data)
        elif data.direction == CalculationDirection.MANUAL_SCORE:
            return self._manual_score_result(data)
        else:
            raise ValueError(f"Unknown calculation direction: {data.direction}")

    def _no_data_result(self, data: KPIInputData) -> CalculationResult:
        """Return result for missing actual values."""
        return CalculationResult(
            achievement_percentage=None,
            variance=None,
            variance_display="N/A",
            rag_status=RAGStatus.NO_DATA,
            trend_status=TrendStatus.NO_DATA if data.previous_actual is None else TrendStatus.INSUFFICIENT_DATA,
        )

    def _calculate_higher_better(self, data: KPIInputData) -> CalculationResult:
        """
        HIGHER IS BETTER: Actual >= Target is good.
        
        Achievement = (Actual / Target) * 100
        Variance = Actual - Target
        
        RAG:
        - ON TRACK: actual >= target
        - AT RISK: actual >= target * warning_threshold (default 85%)
        - OFF TRACK: actual < target * warning_threshold
        """
        if data.target == Decimal("0"):
            raise ValueError("Target cannot be zero for higher-is-better KPI")

        achievement_ratio = data.actual / data.target
        achievement_pct = achievement_ratio * Decimal("100")

        if data.cap_achievement and not data.allow_exceed_100:
            achievement_pct = min(achievement_pct, Decimal("100"))

        variance = data.actual - data.target

        # RAG Status
        if data.actual >= data.target:
            rag = RAGStatus.ON_TRACK
        elif data.actual >= data.target * data.warning_threshold:
            rag = RAGStatus.AT_RISK
        else:
            rag = RAGStatus.OFF_TRACK

        # Trend
        trend = self._calculate_trend(data, higher_is_better=True)

        return CalculationResult(
            achievement_percentage=self._round(achievement_pct),
            variance=self._round(variance),
            variance_display=self._format_variance(variance, data),
            rag_status=rag,
            trend_status=trend,
        )

    def _calculate_lower_better(self, data: KPIInputData) -> CalculationResult:
        """
        LOWER IS BETTER: Actual <= Target is good.
        
        Uses Target/Actual ratio to reward lower values correctly.
        Special handling for zero targets and zero actuals.
        
        Examples:
        - Budget variance: target=10%, actual=2% → 10/2 = 500% → capped at 100%
        - Violations: target=0, actual=0 → 100% (perfect compliance)
        - Violations: target=0, actual=3 → 0% (off track)
        """
        # Handle zero target (compliance KPIs like "zero violations")
        if data.target == Decimal("0"):
            if data.actual == Decimal("0"):
                return CalculationResult(
                    achievement_percentage=Decimal("100"),
                    variance=Decimal("0"),
                    variance_display="0",
                    rag_status=RAGStatus.ON_TRACK,
                    trend_status=self._calculate_trend(data, higher_is_better=False),
                )
            else:
                return CalculationResult(
                    achievement_percentage=Decimal("0"),
                    variance=-data.actual,
                    variance_display=self._format_variance(-data.actual, data),
                    rag_status=RAGStatus.OFF_TRACK,
                    trend_status=self._calculate_trend(data, higher_is_better=False),
                )

        # Handle zero actual (perfect result when target > 0)
        if data.actual == Decimal("0"):
            achievement_pct = Decimal("100")
            variance = data.target  # Positive variance is good for lower-is-better
        else:
            achievement_ratio = data.target / data.actual
            achievement_pct = achievement_ratio * Decimal("100")
            variance = data.target - data.actual

        if data.cap_achievement:
            achievement_pct = min(achievement_pct, Decimal("100"))

        # RAG Status for lower-is-better
        # Tolerance factor: how much above target is "at risk" vs "off track"
        tolerance_factor = Decimal("1") + (Decimal("1") - data.warning_threshold)

        if data.actual <= data.target:
            rag = RAGStatus.ON_TRACK
        elif data.actual <= data.target * tolerance_factor:
            rag = RAGStatus.AT_RISK
        else:
            rag = RAGStatus.OFF_TRACK

        trend = self._calculate_trend(data, higher_is_better=False)

        return CalculationResult(
            achievement_percentage=self._round(achievement_pct),
            variance=self._round(variance),
            variance_display=self._format_variance(variance, data),
            rag_status=rag,
            trend_status=trend,
        )

    def _calculate_exact_target(self, data: KPIInputData) -> CalculationResult:
        """
        EXACT TARGET: Actual must equal Target.
        
        - ON TRACK when actual == target (or within tolerance)
        - OFF TRACK otherwise
        - Achievement based on distance from target
        """
        tolerance = data.tolerance or Decimal("0")

        is_exact_match = abs(data.actual - data.target) <= tolerance

        if is_exact_match:
            achievement_pct = Decimal("100")
            rag = RAGStatus.ON_TRACK
        else:
            distance = abs(data.actual - data.target)
            if data.target != Decimal("0"):
                pct_off = (distance / abs(data.target)) * Decimal("100")
                achievement_pct = max(Decimal("0"), Decimal("100") - pct_off)
            else:
                achievement_pct = Decimal("0") if data.actual != Decimal("0") else Decimal("100")
            rag = RAGStatus.OFF_TRACK

        variance = data.actual - data.target
        trend = self._calculate_exact_target_trend(data)

        return CalculationResult(
            achievement_percentage=self._round(achievement_pct),
            variance=self._round(variance),
            variance_display=self._format_variance(variance, data),
            rag_status=rag,
            trend_status=trend,
        )

    def _calculate_range(self, data: KPIInputData) -> CalculationResult:
        """
        RANGE: Actual must fall between min and max acceptable values.
        """
        if data.min_acceptable is None or data.max_acceptable is None:
            raise ValueError("min_acceptable and max_acceptable required for RANGE KPI")

        variance = Decimal("0")

        if data.min_acceptable <= data.actual <= data.max_acceptable:
            achievement_pct = Decimal("100")
            rag = RAGStatus.ON_TRACK
        elif (
            (data.warning_min is not None and data.warning_max is not None)
            and data.warning_min <= data.actual <= data.warning_max
        ):
            achievement_pct = Decimal("85")
            rag = RAGStatus.AT_RISK
        else:
            # Calculate how far outside range
            if data.actual < data.min_acceptable:
                distance = data.min_acceptable - data.actual
                pct_off = (distance / data.min_acceptable) * Decimal("100") if data.min_acceptable != 0 else Decimal("100")
            else:
                distance = data.actual - data.max_acceptable
                pct_off = (distance / data.max_acceptable) * Decimal("100") if data.max_acceptable != 0 else Decimal("100")
            achievement_pct = max(Decimal("0"), Decimal("100") - pct_off)
            rag = RAGStatus.OFF_TRACK

        trend = self._calculate_trend(data, higher_is_better=True)

        return CalculationResult(
            achievement_percentage=self._round(achievement_pct),
            variance=self._round(variance),
            variance_display=self._format_variance(variance, data),
            rag_status=rag,
            trend_status=trend,
        )

    def _calculate_boolean(self, data: KPIInputData) -> CalculationResult:
        """
        BOOLEAN: Pass/Fail, Yes/No.
        """
        is_pass = data.actual == data.target

        return CalculationResult(
            achievement_percentage=Decimal("100") if is_pass else Decimal("0"),
            variance=Decimal("0") if is_pass else Decimal("-1"),
            variance_display="Pass" if is_pass else "Fail",
            rag_status=RAGStatus.ON_TRACK if is_pass else RAGStatus.OFF_TRACK,
            trend_status=TrendStatus.STABLE,
        )

    def _manual_score_result(self, data: KPIInputData) -> CalculationResult:
        """
        MANUAL SCORE: Achievement is the score itself.
        """
        achievement_pct = data.actual if data.actual else Decimal("0")

        if achievement_pct >= data.target:
            rag = RAGStatus.ON_TRACK
        elif achievement_pct >= data.target * data.warning_threshold:
            rag = RAGStatus.AT_RISK
        else:
            rag = RAGStatus.OFF_TRACK

        return CalculationResult(
            achievement_percentage=self._round(achievement_pct),
            variance=self._round(achievement_pct - data.target),
            variance_display=self._format_variance(achievement_pct - data.target, data),
            rag_status=rag,
            trend_status=self._calculate_trend(data, higher_is_better=True),
        )

    # --- TREND CALCULATION ---

    def _calculate_trend(self, data: KPIInputData, higher_is_better: bool) -> TrendStatus:
        """Compare current actual with previous period actual."""
        if data.previous_actual is None:
            return TrendStatus.NO_DATA

        if data.actual == data.previous_actual:
            return TrendStatus.STABLE

        if higher_is_better:
            return TrendStatus.IMPROVING if data.actual > data.previous_actual else TrendStatus.DECLINING
        else:
            return TrendStatus.IMPROVING if data.actual < data.previous_actual else TrendStatus.DECLINING

    def _calculate_exact_target_trend(self, data: KPIInputData) -> TrendStatus:
        """For exact target, compare distances from target."""
        if data.previous_actual is None:
            return TrendStatus.NO_DATA

        current_distance = abs(data.actual - data.target)
        previous_distance = abs(data.previous_actual - data.target)

        if current_distance == previous_distance:
            return TrendStatus.STABLE
        return TrendStatus.IMPROVING if current_distance < previous_distance else TrendStatus.DECLINING

    # --- AGGREGATION METHODS ---

    def calculate_department_average(
        self,
        results: List[Optional[Decimal]],
        weights: Optional[List[Decimal]] = None,
    ) -> Optional[Decimal]:
        """
        Calculate weighted or simple average of achievement percentages.
        Excludes None values (missing data).
        """
        if weights is None:
            weights = [Decimal("1")] * len(results)

        valid_pairs = [
            (r, w) for r, w in zip(results, weights)
            if r is not None
        ]

        if not valid_pairs:
            return None

        total_weight = sum(w for _, w in valid_pairs)
        if total_weight == Decimal("0"):
            return sum(r for r, _ in valid_pairs) / len(valid_pairs)

        weighted_sum = sum(r * w for r, w in valid_pairs)
        return self._round(weighted_sum / total_weight)

    def calculate_composite_score(
        self,
        scores: Dict[str, Optional[Decimal]],  # {"WEEKLY": 92.5, "MONTHLY": 88.0, ...}
        frequency_weights: Dict[str, Decimal],  # {"WEEKLY": 0.20, "MONTHLY": 0.35, ...}
    ) -> Optional[Decimal]:
        """
        Calculate weighted composite score across reporting frequencies.
        Only includes frequencies with valid (non-None) scores.
        """
        valid_scores = []
        valid_weights = []

        for freq, score in scores.items():
            if score is not None and freq in frequency_weights:
                valid_scores.append(score)
                valid_weights.append(frequency_weights[freq])

        if not valid_scores:
            return None

        total_weight = sum(valid_weights)
        if total_weight == Decimal("0"):
            return sum(valid_scores) / len(valid_scores)

        return self._round(
            sum(s * w for s, w in zip(valid_scores, valid_weights)) / total_weight
        )

    def classify_composite_score(self, score: Optional[Decimal]) -> RAGStatus:
        """
        Classify a composite department score into RAG status.
        Default thresholds (configurable):
        - Excellent (On Track): >= 95%
        - On Track: >= 85%
        - At Risk: >= 75%
        - Off Track: < 75%
        - No Data: None
        """
        if score is None:
            return RAGStatus.NO_DATA

        if score >= Decimal("95"):
            return RAGStatus.ON_TRACK
        elif score >= Decimal("85"):
            return RAGStatus.ON_TRACK
        elif score >= Decimal("75"):
            return RAGStatus.AT_RISK
        else:
            return RAGStatus.OFF_TRACK

    # --- UTILITY METHODS ---

    def _round(self, value: Decimal, places: int = 2) -> Decimal:
        """Round a Decimal to specified places."""
        if value is None:
            return None
        return value.quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)

    def _format_variance(self, variance: Optional[Decimal], data: KPIInputData) -> str:
        """Format variance with appropriate sign and unit context."""
        if variance is None:
            return "N/A"

        sign = "+" if variance > Decimal("0") else ""
        formatted = f"{sign}{self._round(variance)}"

        # Add unit context based on direction
        if data.direction == CalculationDirection.HIGHER_IS_BETTER:
            return f"{formatted}"
        elif data.direction == CalculationDirection.LOWER_IS_BETTER:
            # For lower-is-better, positive variance (target - actual > 0) is good
            return f"{formatted}"
        else:
            return f"{formatted}"