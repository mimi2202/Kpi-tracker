# backend/core/utils.py
"""Shared utilities."""
from decimal import Decimal, ROUND_HALF_UP


def round_decimal(value, places=2):
    """Round a Decimal to specified places."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)


def safe_divide(numerator, denominator, default=None):
    """Safely divide two numbers, returning default if denominator is zero."""
    if denominator is None or denominator == 0:
        return default
    return Decimal(str(numerator)) / Decimal(str(denominator))


def format_percentage(value, decimal_places=1):
    """Format a Decimal as a percentage string."""
    if value is None:
        return "N/A"
    return f"{round_decimal(value, decimal_places)}%"


def format_variance(value, unit="pp"):
    """Format variance with unit."""
    if value is None:
        return "N/A"
    sign = "+" if value > 0 else ""
    return f"{sign}{round_decimal(value)} {unit}"