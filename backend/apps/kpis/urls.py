# backend/apps/kpis/urls.py
"""KPI URLs."""
from rest_framework.routers import SimpleRouter
from .views import KPIViewSet

router = SimpleRouter()
router.register("kpis", KPIViewSet, basename="kpis")

urlpatterns = router.urls