"""Opens the current week/month on demand, and exposes a secret ping URL.

Add to settings.MIDDLEWARE (anywhere after SecurityMiddleware):
    "apps.periods.middleware.PeriodAutoOpenMiddleware",
and set an environment variable CRON_SECRET (any long random string).

Ping URL (for cron-job.org / UptimeRobot / GitHub Actions):
    GET https://<backend>/api/v1/internal/open-periods/?token=<CRON_SECRET>
It opens anything missing and also keeps the free server awake.
"""
import hmac
import logging
import os

from django.http import JsonResponse

logger = logging.getLogger(__name__)

PING_PATH = "/api/v1/internal/open-periods"


class PeriodAutoOpenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path.rstrip("/")
        if path == PING_PATH:
            return self._ping(request)
        if path.startswith("/api/") and request.method != "OPTIONS":
            try:
                from .auto import ensure_current_periods
                ensure_current_periods()
            except Exception:
                logger.exception("Automatic period opening failed")
        return self.get_response(request)

    def _ping(self, request):
        secret = os.environ.get("CRON_SECRET", "")
        token = request.GET.get("token") or request.headers.get("X-Cron-Secret", "")
        if not secret or not hmac.compare_digest(token, secret):
            return JsonResponse({"detail": "Forbidden"}, status=403)
        try:
            from .auto import ensure_current_periods, local_today
            created = ensure_current_periods(force=True)
            return JsonResponse({"ok": True, "date": str(local_today()), "opened": created})
        except Exception:
            logger.exception("Period ping failed")
            return JsonResponse({"ok": False}, status=500)