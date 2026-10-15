"""Import endpoints. Preview runs the same logic as commit but rolls the
transaction back, so what the user sees in preview is exactly what commit will do.
"""
import logging
import traceback

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import Role
from .parsers import parse_file
from .classifier import classify_rows
from .importer import import_rows
from .tracker_parser import trend_start_hint, apply_trend_start

logger = logging.getLogger(__name__)


def _require_manage(user):
    if user.role not in [Role.ADMIN, Role.TEAM_LEADER]:
        raise PermissionDenied("Only admins and team leaders can import data.")


def _parse_uploaded(request):
    """Returns (rows, kind, error_response). kind is resolved here so both
    views share the exact same detection logic.
    """
    uploaded = request.FILES.get("file")
    if not uploaded:
        return None, None, Response({"detail": "No file uploaded."}, status=400)
    try:
        rows, forced_kind = parse_file(uploaded)
    except ValueError as e:
        return None, None, Response({"detail": str(e)}, status=400)

    kind = forced_kind or classify_rows(rows)

    # Weekly / Monthly Trend sheets carry no year (and weekly ones no month).
    # The import screen asks for a starting month + year; when they are sent,
    # every such column is re-anchored from there. Without them the old
    # behaviour (assume the current year) still applies, and the response
    # says a start is needed so the screen can ask.
    start = _read_start(request)
    hint = trend_start_hint(rows) if kind == "tracker_results" else None
    if start and hint is not None:
        rows = apply_trend_start(rows, *start)
    request._trend_info = {"hint": hint, "provided": bool(start and hint is not None)}
    return rows, kind, None


def _read_start(request):
    try:
        month = int(request.data.get("start_month"))
        year = int(request.data.get("start_year"))
    except (TypeError, ValueError):
        return None
    if not (1 <= month <= 12 and 2000 <= year <= 2100):
        return None
    return month, year


def _run_import_safely(rows, kind, organisation_id, dry_run, request_path):
    """Runs import_rows and, on any unexpected exception, logs the full
    traceback to the server console (visible in Render's Logs tab) before
    returning a clean error response. Without this, DEBUG=False in
    production hides the real traceback from both the client AND the logs
    for anything DRF's default handler doesn't already know how to format,
    turning every unexpected failure into an undiagnosable 500 with no
    trace of what actually went wrong.
    """
    try:
        return import_rows(rows, kind, organisation_id, dry_run=dry_run), None
    except Exception:
        logger.exception(
            "Unhandled error during import (path=%s, dry_run=%s, kind=%s, rows=%d)",
            request_path, dry_run, kind, len(rows),
        )
        error_response = Response(
            {
                "detail": (
                    "Something went wrong while processing this file. "
                    "The error has been logged — please try again or contact support "
                    "if this keeps happening."
                ),
            },
            status=500,
        )
        return None, error_response


class ImportPreviewView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        _require_manage(request.user)
        rows, kind, error_response = _parse_uploaded(request)
        if error_response:
            return error_response

        result, error_response = _run_import_safely(
            rows, kind, request.user.organisation_id, dry_run=True, request_path=request.path
        )
        if error_response:
            return error_response

        result["kind"] = kind
        result["preview_rows"] = rows[:5]
        info = getattr(request, "_trend_info", {})
        result["start_hint"] = info.get("hint")
        result["needs_start"] = info.get("hint") is not None and not info.get("provided")
        return Response(result)


class ImportCommitView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        _require_manage(request.user)
        rows, kind, error_response = _parse_uploaded(request)
        if error_response:
            return error_response

        result, error_response = _run_import_safely(
            rows, kind, request.user.organisation_id, dry_run=False, request_path=request.path
        )
        if error_response:
            return error_response

        result["kind"] = kind
        return Response(result)