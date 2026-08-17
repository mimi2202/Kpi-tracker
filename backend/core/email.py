"""Shared helper for sending notification emails. Every place that sends a
notification email calls through here, so the user's email_notifications
preference is enforced in exactly one place, not re-checked (or forgotten)
at each call site.
"""
from django.core.mail import send_mail
from django.conf import settings


def send_notification_email(user, subject, message_lines, from_email=None):
    """Returns True if an email was actually sent, False if it was skipped
    (no address on file, or the user has email notifications turned off).
    fail_silently=True on purpose — a broken SMTP config shouldn't turn a
    KPI submission or approval into a 500 error for the person using the app.
    """
    if not user or not getattr(user, "email", None):
        return False
    if not getattr(user, "email_notifications", True):
        return False

    body = "\n".join(message_lines)
    send_mail(
        subject,
        body,
        from_email or getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@ips.com"),
        [user.email],
        fail_silently=True,
    )
    return True