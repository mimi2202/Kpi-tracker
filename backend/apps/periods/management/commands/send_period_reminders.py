"""Sends a reminder email to anyone with outstanding KPI results in a period
whose submission deadline is coming up soon.

Run this once a day via an external scheduler:
  python manage.py send_period_reminders

Django has no built-in periodic task runner, and this project doesn't have
Celery set up, so this is a plain management command rather than a background
job. On Windows, schedule it with Task Scheduler; on Linux, cron.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.periods.models import ReportingPeriod, PeriodStatus
from apps.results.models import KPIResult, ResultStatus
from core.email import send_notification_email

REMINDER_WINDOW_DAYS = 2


class Command(BaseCommand):
    help = "Emails a reminder to anyone with outstanding KPI results in a period closing soon."

    def handle(self, *args, **options):
        now = timezone.now()
        window_end = now + timedelta(days=REMINDER_WINDOW_DAYS)

        periods = ReportingPeriod.objects.filter(
            status=PeriodStatus.OPEN,
            submission_deadline__isnull=False,
            submission_deadline__gte=now,
            submission_deadline__lte=window_end,
        )

        sent = 0
        for period in periods:
            outstanding = (
                KPIResult.objects
                .filter(
                    reporting_period=period,
                    submission_status__in=[ResultStatus.DRAFT, ResultStatus.RETURNED],
                )
                .select_related("kpi", "responsible_person")
            )

            by_user = {}
            for result in outstanding:
                if not result.responsible_person:
                    continue
                by_user.setdefault(result.responsible_person, []).append(result)

            for user, results in by_user.items():
                if not getattr(user, "period_reminders", True):
                    continue

                kpi_lines = [f"- {r.kpi.code}: {r.kpi.name}" for r in results]
                was_sent = send_notification_email(
                    user,
                    subject=f"Reminder: {period.label} closes soon",
                    message_lines=[
                        f"The {period.label} reporting period closes on "
                        f"{period.submission_deadline.strftime('%d %b %Y, %H:%M')}.",
                        "",
                        f"You still have {len(results)} KPI result(s) not yet submitted:",
                        *kpi_lines,
                    ],
                )
                if was_sent:
                    sent += 1

        self.stdout.write(self.style.SUCCESS(f"Sent {sent} reminder email(s)."))