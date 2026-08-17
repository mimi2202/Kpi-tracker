"""Import endpoints. Preview runs the same logic as commit but rolls the
transaction back, so what the user sees in preview is exactly what commit will do.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import Role
from .parsers import parse_file
from .classifier import classify_rows
from .importer import import_rows


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
    return rows, kind, None


class ImportPreviewView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        _require_manage(request.user)
        rows, kind, error_response = _parse_uploaded(request)
        if error_response:
            return error_response

        result = import_rows(rows, kind, request.user.organisation_id, dry_run=True)
        result["kind"] = kind
        result["preview_rows"] = rows[:5]
        return Response(result)


class ImportCommitView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        _require_manage(request.user)
        rows, kind, error_response = _parse_uploaded(request)
        if error_response:
            return error_response

        result = import_rows(rows, kind, request.user.organisation_id, dry_run=False)
        result["kind"] = kind
        return Response(result)