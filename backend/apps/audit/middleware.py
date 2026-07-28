# apps/audit/middleware.py
"""Audit logging middleware."""


class AuditLogMiddleware:
    """Middleware to capture request info for audit logs."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return response