"""Report export endpoint. Serves CSV, Excel, and PDF from the same data context.
Scoping (admin/team leader/member) happens inside get_report_context, based on request.user.
"""
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from .generators.data import get_report_context
from .generators.excel_generator import build_excel
from .generators.pdf_generator import build_pdf
from .generators.csv_generator import build_csv

VALID_PERIOD_TYPES = {"WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"}
VALID_FORMATS = {"csv", "excel", "pdf"}


class ExportReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, period_type, file_format):
        period_type = period_type.upper()
        file_format = file_format.lower()

        if period_type not in VALID_PERIOD_TYPES:
            return HttpResponse(f"Unknown period type: {period_type}", status=400)
        if file_format not in VALID_FORMATS:
            return HttpResponse(f"Unknown format: {file_format}", status=400)

        context = get_report_context(request.user, period_type)
        org_name = getattr(request.user.organisation, "name", "Organisation")
        filename_base = f"kpi_report_{period_type.lower()}"

        if file_format == "csv":
            body = build_csv(context)
            response = HttpResponse(body, content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
            return response

        if file_format == "excel":
            body = build_excel(context, org_name)
            response = HttpResponse(
                body,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = f'attachment; filename="{filename_base}.xlsx"'
            return response

        body = build_pdf(context, org_name)
        response = HttpResponse(body, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename_base}.pdf"'
        return response