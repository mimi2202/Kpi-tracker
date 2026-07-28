# backend/apps/results/tests/test_calculation_engine.py
"""
Comprehensive tests for the KPI Calculation Engine.
Covers all calculation directions, edge cases, and aggregation methods.
"""
from decimal import Decimal
import pytest
from apps.results.calculation import (
    KPICalculationEngine,
    KPIInputData,
    CalculationResult,
    CalculationDirection,
    RAGStatus,
    TrendStatus,
)


class TestHigherIsBetter:
    """Tests for HIGHER_IS_BETTER KPI calculations."""
    
    def setup_method(self):
        self.engine = KPICalculationEngine()

    def test_on_track_exceeds_target(self):
        """Actual exceeds target → ON TRACK, 100% (capped)."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("95"),
            target=Decimal("90"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK
        assert result.achievement_percentage == Decimal("100")
        assert result.variance == Decimal("5")

    def test_on_track_meets_target(self):
        """Actual equals target → ON TRACK, 100%."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("90"),
            target=Decimal("90"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK
        assert result.achievement_percentage == Decimal("100")
        assert result.variance == Decimal("0")

    def test_at_risk_within_warning(self):
        """Actual at 87% of target → AT RISK (within 85% warning)."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("78.3"),
            target=Decimal("90"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.AT_RISK
        assert result.achievement_percentage == Decimal("87")  # 78.3/90 = 87%

    def test_off_track_below_warning(self):
        """Actual below warning threshold → OFF TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("70"),
            target=Decimal("90"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.OFF_TRACK
        assert result.achievement_percentage == Decimal("77.78")

    def test_no_data_null_actual(self):
        """Null actual → NO DATA."""
        result = self.engine.calculate(KPIInputData(
            actual=None,
            target=Decimal("90"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.NO_DATA
        assert result.achievement_percentage is None

    def test_trend_improving(self):
        """Higher current vs previous → IMPROVING."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("85"),
            target=Decimal("90"),
            previous_actual=Decimal("80"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.trend_status == TrendStatus.IMPROVING

    def test_trend_declining(self):
        """Lower current vs previous → DECLINING."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("80"),
            target=Decimal("90"),
            previous_actual=Decimal("85"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.trend_status == TrendStatus.DECLINING

    def test_trend_stable(self):
        """Same values → STABLE."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("85"),
            target=Decimal("90"),
            previous_actual=Decimal("85"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result.trend_status == TrendStatus.STABLE

    def test_allow_exceed_100(self):
        """With allow_exceed_100, achievement can go above 100%."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("100"),
            target=Decimal("90"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
            allow_exceed_100=True,
            cap_achievement=False,
        ))
        assert result.achievement_percentage == Decimal("111.11")


class TestLowerIsBetter:
    """Tests for LOWER_IS_BETTER KPI calculations."""

    def setup_method(self):
        self.engine = KPICalculationEngine()

    def test_on_track_below_target(self):
        """Actual below target → ON TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("5"),
            target=Decimal("10"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK
        assert result.achievement_percentage == Decimal("100")

    def test_on_track_equals_target(self):
        """Actual equals target → ON TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("10"),
            target=Decimal("10"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK

    def test_at_risk_slightly_above(self):
        """Actual slightly above target → AT RISK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("11"),
            target=Decimal("10"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        # 10/11 = 90.91%, slightly above target but within tolerance
        assert result.rag_status == RAGStatus.AT_RISK
        assert result.achievement_percentage == Decimal("90.91")

    def test_off_track_well_above(self):
        """Actual well above target → OFF TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("20"),
            target=Decimal("10"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        # 10/20 = 50%
        assert result.rag_status == RAGStatus.OFF_TRACK
        assert result.achievement_percentage == Decimal("50")

    def test_zero_target_perfect(self):
        """Zero violations target, zero actual → 100% ON TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("0"),
            target=Decimal("0"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK
        assert result.achievement_percentage == Decimal("100")

    def test_zero_target_violation(self):
        """Zero violations target, non-zero actual → OFF TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("3"),
            target=Decimal("0"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.rag_status == RAGStatus.OFF_TRACK
        assert result.achievement_percentage == Decimal("0")

    def test_trend_improving_lower(self):
        """Lower actual (better) vs previous → IMPROVING."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("5"),
            target=Decimal("10"),
            previous_actual=Decimal("8"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.trend_status == TrendStatus.IMPROVING

    def test_trend_declining_higher(self):
        """Higher actual (worse) vs previous → DECLINING."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("12"),
            target=Decimal("10"),
            previous_actual=Decimal("8"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.trend_status == TrendStatus.DECLINING

    def test_variance_positive_when_good(self):
        """Variance is target - actual, positive when performing well."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("5"),
            target=Decimal("10"),
            direction=CalculationDirection.LOWER_IS_BETTER,
        ))
        assert result.variance == Decimal("5")  # 10 - 5 = 5 (positive, good)


class TestExactTarget:
    """Tests for EXACT_TARGET KPI calculations."""

    def setup_method(self):
        self.engine = KPICalculationEngine()

    def test_exact_match_on_track(self):
        """Exact match → ON TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("4"),
            target=Decimal("4"),
            direction=CalculationDirection.EXACT_TARGET,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK
        assert result.achievement_percentage == Decimal("100")

    def test_no_match_off_track(self):
        """No match → OFF TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("3"),
            target=Decimal("4"),
            direction=CalculationDirection.EXACT_TARGET,
        ))
        assert result.rag_status == RAGStatus.OFF_TRACK
        assert result.achievement_percentage == Decimal("75")  # 25% off target

    def test_trend_closer_is_improving(self):
        """Current closer to target than previous → IMPROVING."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("4"),
            target=Decimal("4"),
            previous_actual=Decimal("3"),
            direction=CalculationDirection.EXACT_TARGET,
        ))
        assert result.trend_status == TrendStatus.IMPROVING


class TestRange:
    """Tests for RANGE KPI calculations."""

    def setup_method(self):
        self.engine = KPICalculationEngine()

    def test_within_range_on_track(self):
        """Actual within acceptable range → ON TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("50"),
            target=Decimal("50"),
            min_acceptable=Decimal("40"),
            max_acceptable=Decimal("60"),
            direction=CalculationDirection.RANGE,
        ))
        assert result.rag_status == RAGStatus.ON_TRACK
        assert result.achievement_percentage == Decimal("100")

    def test_outside_range_off_track(self):
        """Actual outside range → OFF TRACK."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("70"),
            target=Decimal("50"),
            min_acceptable=Decimal("40"),
            max_acceptable=Decimal("60"),
            direction=CalculationDirection.RANGE,
        ))
        assert result.rag_status == RAGStatus.OFF_TRACK


class TestAggregations:
    """Tests for department averages and composite scores."""

    def setup_method(self):
        self.engine = KPICalculationEngine()

    def test_simple_average(self):
        """Simple average of valid scores."""
        results = [Decimal("80"), Decimal("90"), Decimal("100")]
        avg = self.engine.calculate_department_average(results)
        assert avg == Decimal("90")

    def test_average_excludes_none(self):
        """Average ignores None (missing data)."""
        results = [Decimal("80"), None, Decimal("100")]
        avg = self.engine.calculate_department_average(results)
        assert avg == Decimal("90")

    def test_average_all_none_returns_none(self):
        """All None → None."""
        results = [None, None, None]
        avg = self.engine.calculate_department_average(results)
        assert avg is None

    def test_weighted_average(self):
        """Weighted average with different weights."""
        results = [Decimal("80"), Decimal("90")]
        weights = [Decimal("0.3"), Decimal("0.7")]
        avg = self.engine.calculate_department_average(results, weights)
        # (80*0.3 + 90*0.7) / (0.3+0.7) = (24+63)/1 = 87
        assert avg == Decimal("87")

    def test_composite_score(self):
        """Composite score across frequencies."""
        scores = {
            "WEEKLY": Decimal("92"),
            "MONTHLY": Decimal("88"),
            "QUARTERLY": None,  # Not available
            "ANNUAL": Decimal("95"),
        }
        weights = {
            "WEEKLY": Decimal("0.20"),
            "MONTHLY": Decimal("0.35"),
            "QUARTERLY": Decimal("0.35"),
            "ANNUAL": Decimal("0.10"),
        }
        composite = self.engine.calculate_composite_score(scores, weights)
        # (92*0.20 + 88*0.35 + 95*0.10) / (0.20+0.35+0.10)
        # = (18.4 + 30.8 + 9.5) / 0.65 = 58.7 / 0.65 = 90.31
        assert composite == Decimal("90.31")

    def test_composite_all_none(self):
        """All scores None → None."""
        scores = {"WEEKLY": None, "MONTHLY": None}
        weights = {"WEEKLY": Decimal("0.5"), "MONTHLY": Decimal("0.5")}
        composite = self.engine.calculate_composite_score(scores, weights)
        assert composite is None


class TestEdgeCases:
    """Edge case and boundary tests."""

    def setup_method(self):
        self.engine = KPICalculationEngine()

    def test_zero_target_higher_better_raises(self):
        """Zero target for higher-is-better raises error."""
        with pytest.raises(ValueError):
            self.engine.calculate(KPIInputData(
                actual=Decimal("5"),
                target=Decimal("0"),
                direction=CalculationDirection.HIGHER_IS_BETTER,
            ))

    def test_missing_actual_distinct_from_zero(self):
        """None actual (missing) ≠ zero actual."""
        result_none = self.engine.calculate(KPIInputData(
            actual=None,
            target=Decimal("10"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result_none.rag_status == RAGStatus.NO_DATA

        result_zero = self.engine.calculate(KPIInputData(
            actual=Decimal("0"),
            target=Decimal("10"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
        ))
        assert result_zero.rag_status == RAGStatus.OFF_TRACK

    def test_custom_warning_threshold(self):
        """Custom warning threshold affects RAG boundary."""
        result = self.engine.calculate(KPIInputData(
            actual=Decimal("80"),
            target=Decimal("100"),
            direction=CalculationDirection.HIGHER_IS_BETTER,
            warning_threshold=Decimal("0.90"),  # More strict: 90% instead of 85%
        ))
        # At 80%, below 90% warning → OFF TRACK
        assert result.rag_status == RAGStatus.OFF_TRACK