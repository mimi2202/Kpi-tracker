"""KPI URLs."""
from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import KPIViewSet
from .preset_views import KPIPresetViewSet, KPIPresetCategoryViewSet
from .search_views import GlobalSearchView

router = SimpleRouter()
router.register("kpis", KPIViewSet, basename="kpis")
router.register("kpi-presets", KPIPresetViewSet, basename="kpi-presets")
router.register("kpi-preset-categories", KPIPresetCategoryViewSet, basename="kpi-preset-categories")

urlpatterns = router.urls + [
    path("search/", GlobalSearchView.as_view(), name="global-search"),
]