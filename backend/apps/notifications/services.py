"""Notification service — creates notifications on key events."""
from django.utils import timezone
from apps.notifications.models import Notification, NotificationType


class NotificationService:
    @staticmethod
    def kpi_submitted(result, submitted_by):
        _notify_manager(result, NotificationType.KPI_SUBMITTED,
            title="KPI Result Submitted",
            message=f"{submitted_by.full_name} submitted {result.kpi.code} - {result.kpi.name}",
            link=f"/results/{result.id}")
    
    @staticmethod
    def kpi_approved(result, approved_by):
        Notification.objects.create(
            user=result.responsible_person,
            notification_type=NotificationType.KPI_APPROVED,
            title="KPI Result Approved",
            message=f"Your result for {result.kpi.code} was approved by {approved_by.full_name}",
            link=f"/results/{result.id}",
            kpi_result=result,
        )
    
    @staticmethod
    def kpi_returned(result, returned_by, reason):
        Notification.objects.create(
            user=result.responsible_person,
            notification_type=NotificationType.KPI_RETURNED,
            title="KPI Result Returned",
            message=f"{returned_by.full_name} returned {result.kpi.code}: {reason}",
            link=f"/results/{result.id}",
            kpi_result=result,
        )
    
    @staticmethod
    def kpi_rag_changed(result, old_status, new_status):
        if new_status in ["AT_RISK", "OFF_TRACK"] and old_status != new_status:
            ntype = NotificationType.KPI_AT_RISK if new_status == "AT_RISK" else NotificationType.KPI_OFF_TRACK
            _notify_manager(result, ntype,
                title=f"KPI {new_status.replace('_', ' ').title()}",
                message=f"{result.kpi.code} - {result.kpi.name} is now {new_status.replace('_', ' ').title()}",
                link=f"/results/{result.id}")
            Notification.objects.create(
                user=result.responsible_person,
                notification_type=ntype,
                title=f"Your KPI is {new_status.replace('_', ' ').title()}",
                message=f"{result.kpi.code} needs attention. Current achievement: {result.achievement_percentage}%",
                link=f"/results/{result.id}",
                kpi_result=result,
            )
    
    @staticmethod
    def period_closing_soon(period, user):
        Notification.objects.create(
            user=user,
            notification_type=NotificationType.PERIOD_CLOSING,
            title="Period Closing Soon",
            message=f"{period.label} closes on {period.end_date}. You have missing KPI entries.",
            link=f"/weekly?period={period.id}",
            period=period,
        )
    
    @staticmethod
    def period_summary(user, period, achievement, on_track, at_risk, off_track):
        Notification.objects.create(
            user=user,
            notification_type=NotificationType.PERIOD_SUMMARY,
            title=f"Period Summary: {period.label}",
            message=f"Your achievement: {achievement}%. On track: {on_track}, At risk: {at_risk}, Off track: {off_track}.",
            link=f"/dashboard?period={period.id}",
            period=period,
        )
    
    @staticmethod
    def member_added(admin, new_member):
        Notification.objects.create(
            user=new_member,
            notification_type=NotificationType.MEMBER_ADDED,
            title="Welcome to the Team",
            message=f"{admin.full_name} added you to the organization.",
            link="/dashboard",
        )


def _notify_manager(result, ntype, title, message, link=""):
    """Notify the result owner's manager (team leader or admin)."""
    from apps.accounts.models import Role
    owner = result.responsible_person
    if owner and owner.manager:
        Notification.objects.create(
            user=owner.manager,
            notification_type=ntype,
            title=title,
            message=message,
            link=link,
            kpi_result=result,
        )
    # Also notify all admins in the org
    if owner and owner.organisation:
        from apps.accounts.models import User
        admins = User.objects.filter(organisation=owner.organisation, role=Role.ADMIN).exclude(id=owner.manager_id)
        for admin in admins:
            Notification.objects.create(
                user=admin,
                notification_type=ntype,
                title=title,
                message=message,
                link=link,
                kpi_result=result,
            )
