"""KPI Result views - RBAC enforced."""
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.shortcuts import get_object_or_404
from django.db import transaction
from decimal import Decimal
from django.http import HttpResponse

from .models import KPIResult, KPIResultVersion, ResultStatus
from .serializers import (
    KPIResultSerializer, KPIResultEntrySerializer,
    BulkSaveSerializer, ResultApprovalSerializer,
    KPIResultVersionSerializer,
)
from apps.accounts.permissions import IsAdminOrTeamLeader, IsOwnerOrManager
from apps.accounts.models import Role, User
from apps.kpis.models import KPI, KPIAssignment
from apps.periods.models import ReportingPeriod


class KPIResultViewSet(viewsets.ModelViewSet):
    lookup_value_regex = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    serializer_class = KPIResultSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["department", "reporting_period", "kpi", "rag_status", "submission_status", "trend_status", "responsible_person"]
    search_fields = ["kpi__code", "kpi__name", "notes"]
    ordering_fields = ["created_at", "achievement_percentage", "department__name"]
    ordering = ["-period_start_date", "department__name"]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "bulk_save", "submit", "bulk_submit", "sync_my_results"]:
            return [permissions.IsAuthenticated()]
        if self.action in ["approve", "return_result", "destroy", "generate_period_results"]:
            return [permissions.IsAuthenticated(), IsAdminOrTeamLeader()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = KPIResult.objects.select_related("kpi", "department", "reporting_period", "responsible_person", "submitted_by", "reviewed_by")
        return qs.filter(id__in=user.get_visible_kpi_results().values_list('id', flat=True))

    def get_serializer_class(self):
        if self.action == "list":
            return KPIResultEntrySerializer
        return KPIResultSerializer

    def perform_update(self, serializer):
        # Ownership guard: a member may only edit their OWN result row.
        obj = serializer.instance
        u = self.request.user
        if obj.responsible_person_id != u.id and u.role not in [Role.ADMIN, Role.TEAM_LEADER]:
            raise PermissionDenied("You can only edit your own results.")
        serializer.save()

    # ---- shared row-generation helper ----
    @staticmethod
    def _row_defaults(kpi, period):
        return {
            "department": kpi.department,
            # VERIFY these attribute names against your ReportingPeriod model.
            "period_type": getattr(period, "period_type", "WEEKLY"),
            "period_start_date": period.start_date,
            "period_end_date": period.end_date,
            "period_label": getattr(period, "label", ""),
            "reporting_year": getattr(period, "year", period.start_date.year),
            "week_number": getattr(period, "week_number", None),
            "month": getattr(period, "month", None),
            "quarter": getattr(period, "quarter", None),
            "target_value": kpi.target_value,
            "calculation_direction": kpi.calculation_direction,
            "warning_threshold": getattr(kpi, "warning_threshold", Decimal("0.85")) or Decimal("0.85"),
        }

    @action(detail=False, methods=["post"])
    def sync_my_results(self, request):
        """Ensure the CALLER has result rows for all their active assignments in
        this period. Idempotent — the entry page calls this on load so rows exist
        for any period (past or future) without manual backfill.

        Only generates rows for KPIs whose reporting_frequency matches the period
        type, so weekly KPIs don't spawn monthly rows and vice versa.
        """
        period = get_object_or_404(ReportingPeriod, id=request.data.get("period_id"))
        period_type = getattr(period, "period_type", None)

        assignments = KPIAssignment.objects.filter(
            user=request.user, is_active=True
        ).select_related("kpi", "kpi__department")

        created = 0
        for a in assignments:
            kpi = a.kpi
            # Skip KPIs whose frequency doesn't match this period's type.
            if period_type and getattr(kpi, "reporting_frequency", None) and kpi.reporting_frequency != period_type:
                continue
            _, was_created = KPIResult.objects.get_or_create(
                kpi=kpi, reporting_period=period, responsible_person=request.user,
                defaults=self._row_defaults(kpi, period),
            )
            created += 1 if was_created else 0
        return Response({"success": True, "created": created})

    @action(detail=False, methods=["post"])
    def generate_period_results(self, request):
        """Admin/team leader: create DRAFT rows for a period from ALL standing
        assignments in the org (not just the caller's). Backfills existing periods."""
        period = get_object_or_404(ReportingPeriod, id=request.data.get("period_id"))
        from apps.results.generation import generate_results_for_period
        created = generate_results_for_period(period, organisation_id=request.user.organisation_id)
        return Response({"success": True, "created": created})

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def bulk_save(self, request):
        items = request.data.get("results", [])
        period_id = request.data.get("period_id")
        saved_results = []
        errors = []

        for item in items:
            try:
                result_id = item.get("id")
                actual_value = item.get("actual_value")
                notes = item.get("notes", "")
                corrective_action = item.get("corrective_action", "")

                if result_id:
                    result = get_object_or_404(KPIResult, id=result_id)
                    if result.responsible_person_id != request.user.id and request.user.role not in [Role.ADMIN, Role.TEAM_LEADER]:
                        errors.append({"id": result_id, "error": "You can only edit your own results."})
                        continue
                    if result.submission_status == ResultStatus.LOCKED:
                        errors.append({"id": result_id, "error": "Result is locked."})
                        continue
                    if actual_value is not None:
                        result.actual_value = Decimal(str(actual_value))
                    if notes:
                        result.notes = notes
                    if corrective_action:
                        result.corrective_action = corrective_action
                    result.save()
                    saved_results.append(result)
                else:
                    kpi_id = item.get("kpi_id")
                    item_period_id = item.get("period_id") or period_id
                    kpi = get_object_or_404(KPI, id=kpi_id)
                    period = get_object_or_404(ReportingPeriod, id=item_period_id)
                    result, _created = KPIResult.objects.get_or_create(
                        kpi_id=kpi_id,
                        reporting_period_id=item_period_id,
                        responsible_person=request.user,
                        defaults=self._row_defaults(kpi, period),
                    )
                    if actual_value is not None:
                        result.actual_value = Decimal(str(actual_value))
                    if notes:
                        result.notes = notes
                    if corrective_action:
                        result.corrective_action = corrective_action
                    result.save()
                    saved_results.append(result)
            except Exception as e:
                errors.append({"item": item, "error": str(e)})

        return Response({"success": True, "saved_count": len(saved_results), "error_count": len(errors), "errors": errors})

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        result = self.get_object()
        if result.responsible_person != request.user and request.user.role not in [Role.ADMIN, Role.TEAM_LEADER]:
            return Response({"success": False, "error": "Not authorized."}, status=403)
        try:
            result.submit(request.user)
            self._notify_submit(result, request.user)
            return Response({"success": True, "message": "Submitted."})
        except Exception as e:
            return Response({"success": False, "error": str(e)}, status=400)

    @action(detail=False, methods=["post"])
    def bulk_submit(self, request):
        result_ids = request.data.get("result_ids", [])
        period_id = request.data.get("period_id")

        # Submit only the caller's OWN results for this period.
        results = KPIResult.objects.filter(responsible_person=request.user)
        if period_id:
            results = results.filter(reporting_period_id=period_id)
        else:
            results = results.filter(id__in=result_ids)
        results = results.filter(submission_status__in=[ResultStatus.DRAFT, ResultStatus.RETURNED])

        submitted = 0
        errors = []
        for result in results:
            try:
                result.submit(request.user)
                self._notify_submit(result, request.user)
                submitted += 1
            except Exception as e:
                errors.append({"id": str(result.id), "error": str(e)})

        return Response({"success": True, "submitted_count": submitted, "errors": errors})

    def _notify_submit(self, result, user):
        try:
            from apps.notifications.models import Notification, NotificationType
            from apps.organisation.models import UserDepartment

            dept = result.department

            team_leaders = UserDepartment.objects.filter(
                department=dept, is_department_head=True
            ).select_related("user")
            for tl in team_leaders:
                Notification.objects.create(
                    user=tl.user,
                    notification_type=NotificationType.KPI_SUBMITTED,
                    title="KPI Submitted",
                    message=f"{result.kpi.code} submitted by {result.responsible_person.full_name if result.responsible_person else 'a member'}",
                    kpi_result=result,
                )

            if result.responsible_person and result.responsible_person.organisation:
                admin = User.objects.filter(
                    organisation=result.responsible_person.organisation,
                    role=Role.ADMIN,
                ).first()
                if admin:
                    Notification.objects.create(
                        user=admin,
                        notification_type=NotificationType.KPI_SUBMITTED,
                        title="KPI Submitted",
                        message=f"{result.kpi.code} submitted by {result.responsible_person.full_name if result.responsible_person else 'a member'} in {dept.name}",
                        kpi_result=result,
                    )
        except Exception:
            import traceback
            traceback.print_exc()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        result = self.get_object()
        serializer = ResultApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result.approve(request.user, level=serializer.validated_data["action"])
            return Response({"success": True, "message": "Approved."})
        except Exception as e:
            return Response({"success": False, "error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def return_result(self, request, pk=None):
        result = self.get_object()
        serializer = ResultApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result.return_for_revision(user=request.user, reason=serializer.validated_data.get("return_reason", ""))
            return Response({"success": True, "message": "Returned for revision."})
        except Exception as e:
            return Response({"success": False, "error": str(e)}, status=400)

    @action(detail=False, methods=["get"])
    def export(self, request):
        format_type = request.query_params.get("format", "csv")
        period_type = request.query_params.get("period_type", "WEEKLY")
        results = self.get_queryset().filter(period_type=period_type)
        serializer = KPIResultSerializer(results, many=True)

        if format_type == "csv":
            import csv
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="kpi_report_{period_type}.csv"'
            writer = csv.writer(response)
            writer.writerow(['KPI Code', 'KPI Name', 'Department', 'Target', 'Actual', 'Achievement', 'Status', 'Period'])
            for r in serializer.data:
                writer.writerow([r.get('kpi_code'), r.get('kpi_name'), r.get('department_name'), r.get('target_value'), r.get('actual_value'), r.get('achievement_percentage'), r.get('rag_status'), r.get('period_label')])
            return response

        elif format_type == "excel":
            import openpyxl
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename="kpi_report_{period_type}.xlsx"'
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = f"KPI Report - {period_type}"
            ws.append(['KPI Code', 'KPI Name', 'Department', 'Target', 'Actual', 'Achievement', 'Status', 'Period'])
            for r in serializer.data:
                ws.append([r.get('kpi_code'), r.get('kpi_name'), r.get('department_name'), r.get('target_value'), r.get('actual_value'), r.get('achievement_percentage'), r.get('rag_status'), r.get('period_label')])
            wb.save(response)
            return response

        return Response(serializer.data)