from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.periods.models import ReportingPeriod
from apps.notifications.models import Notification, NotificationType
from apps.results.models import KPIResult
from django.db.models import Avg

class Command(BaseCommand):
    help = 'Auto-close ended periods and send summaries'

    def handle(self, *args, **options):
        today = timezone.now().date()
        ended = ReportingPeriod.objects.filter(end_date__lt=today, status='OPEN')
        for period in ended:
            period.status = 'CLOSED'
            period.save()
            # Notify users with their summary
            from apps.accounts.models import User
            users = User.objects.filter(organisation=period.period_type)  # Simplified
            for user in users[:10]:  # Limit for safety
                results = KPIResult.objects.filter(reporting_period=period, responsible_person=user)
                avg = results.exclude(achievement_percentage__isnull=True).aggregate(avg=Avg("achievement_percentage"))["avg"]
                Notification.objects.create(
                    user=user,
                    notification_type=NotificationType.PERIOD_CLOSED,
                    title=f"Period Closed: {period.label}",
                    message=f"Your achievement: {round(float(avg), 1) if avg else 'N/A'}%",
                    period=period,
                )
            self.stdout.write(f"Closed: {period.label}")
