# backend/apps/periods/signals.py
"""Auto-generate result rows when a reporting period is opened."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ReportingPeriod


@receiver(post_save, sender=ReportingPeriod)
def create_results_on_period_open(sender, instance, created, **kwargs):
    # Generate on creation. If you have an explicit open/active flag or status,
    # switch the condition to fire when it flips to open instead of on `created`.
    if not created:
        return
    from apps.results.generation import generate_results_for_period
    # Scope to the org that owns the period's departments. If ReportingPeriod is
    # itself org-scoped, pass instance.organisation_id; otherwise None = all.
    org_id = getattr(instance, "organisation_id", None)
    generate_results_for_period(instance, organisation_id=org_id)