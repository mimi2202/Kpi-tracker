"""Reports URLs."""
from django.urls import path
from .views import ExportReportView

urlpatterns = [
    path("export/<str:period_type>/<str:file_format>/", ExportReportView.as_view(), name="export-report"),
]