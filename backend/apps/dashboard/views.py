"""Dashboard API views — RBAC-filtered."""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .services import DashboardService


def _get_service(request, **kwargs):
    """Build DashboardService with user context for RBAC filtering."""
    return DashboardService(user=request.user, **kwargs)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    service = _get_service(
        request,
        period_type=request.query_params.get("period_type"),
        period_id=request.query_params.get("period_id"),
        department_id=request.query_params.get("department_id"),
    )
    return Response(service.get_summary())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_departments(request):
    service = _get_service(
        request,
        period_type=request.query_params.get("period_type"),
        period_id=request.query_params.get("period_id"),
    )
    return Response(service.get_department_performance())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_trends(request):
    service = _get_service(
        request,
        period_type=request.query_params.get("period_type"),
        period_id=request.query_params.get("period_id"),
    )
    # FIX: this view previously never read department_id at all — it only
    # looked for a plural "departments" list param that the frontend never
    # sends, so clicking a department card had zero effect on the trend
    # data returned here. Accept both: a single department_id (what the
    # dashboard's trend widget actually sends) folded into a one-item list,
    # OR an explicit multi-department "departments" list if a caller wants
    # to compare several departments at once — either way ends up as the
    # same list shape get_trend_data() already expects.
    department_id = request.query_params.get("department_id")
    departments = request.query_params.getlist("departments")
    if department_id:
        departments = [department_id]
    return Response(service.get_trend_data(departments=departments if departments else None))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_kpis(request):
    service = _get_service(
        request,
        period_type=request.query_params.get("period_type"),
        period_id=request.query_params.get("period_id"),
        department_id=request.query_params.get("department_id"),
    )
    data = service.get_kpi_details()
    rag_status = request.query_params.get("rag_status")
    if rag_status:
        data = [d for d in data if d["rag_status"] == rag_status]

    from core.pagination import StandardPagination
    paginator = StandardPagination()
    page = paginator.paginate_queryset(data, request)
    if page is not None:
        return paginator.get_paginated_response(page)
    return Response({"count": len(data), "results": data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_scorecard(request):
    service = _get_service(
        request,
        period_type=request.query_params.get("period_type"),
        period_id=request.query_params.get("period_id"),
    )
    return Response(service.get_scorecard())