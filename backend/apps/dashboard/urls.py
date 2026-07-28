from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/summary/", views.dashboard_summary, name="dashboard-summary"),
    path("dashboard/departments/", views.dashboard_departments, name="dashboard-departments"),
    path("dashboard/trends/", views.dashboard_trends, name="dashboard-trends"),
    path("dashboard/kpis/", views.dashboard_kpis, name="dashboard-kpis"),
    path("dashboard/scorecard/", views.dashboard_scorecard, name="dashboard-scorecard"),
]
