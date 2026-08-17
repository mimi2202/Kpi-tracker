from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import KPIResultViewSet

router = SimpleRouter()
router.register("results", KPIResultViewSet, basename="results")

urlpatterns = router.urls