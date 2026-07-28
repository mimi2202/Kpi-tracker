from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import KPIResultViewSet

router = SimpleRouter()
router.register("results", KPIResultViewSet, basename="results")

urlpatterns = [
    path("export/<str:period_type>/<str:format>/", KPIResultViewSet.as_view({"get": "export"}), name="results-export"),
] + router.urls
