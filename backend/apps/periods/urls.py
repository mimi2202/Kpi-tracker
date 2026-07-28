from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import ReportingPeriodViewSet

router = SimpleRouter()
router.register("periods", ReportingPeriodViewSet, basename="periods")

urlpatterns = router.urls