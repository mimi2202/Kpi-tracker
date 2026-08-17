"""Shared helper for writing audit log entries. Every mutation elsewhere in
the app that should be tracked calls through here, so entry creation and IP
capture happen in exactly one place, not duplicated at each call site.
"""
from apps.audit.middleware import get_current_request


def log_action(user, action, target=""):
    try:
        from apps.audit.models import AuditLog

        if not user or not getattr(user, "organisation_id", None):
            return

        request = get_current_request()
        ip_address = None
        if request is not None:
            forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
            ip_address = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")

        AuditLog.objects.create(
            organisation_id=user.organisation_id,
            user=user,
            action=action,
            target=target,
            ip_address=ip_address,
        )
    except Exception:
        # Logging failures should never break the actual feature that triggered them.
        import traceback
        traceback.print_exc()