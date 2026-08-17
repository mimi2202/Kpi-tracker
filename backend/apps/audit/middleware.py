"""Audit logging middleware. Stashes the current request in thread-local
storage for the duration of the request/response cycle, so core.audit.log_action
can read the caller's IP address without every call site needing the request
passed in explicitly. The previous version of this file did nothing at all.
"""
import threading

_thread_locals = threading.local()


def get_current_request():
    return getattr(_thread_locals, "request", None)


class AuditLogMiddleware:
    """Makes the in-flight request available to core.audit.log_action via
    thread-local storage. Doesn't write anything itself, that stays the
    job of log_action, called explicitly from the views that need it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.request = request
        try:
            response = self.get_response(request)
        finally:
            _thread_locals.request = None
        return response