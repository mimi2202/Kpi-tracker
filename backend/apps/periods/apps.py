# backend/apps/periods/apps.py
# Wire the signal so auto-generation fires on period creation.
from django.apps import AppConfig


class PeriodsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.periods"

    def ready(self):
        from . import signals  # noqa: F401  registers post_save handler