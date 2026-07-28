from django.urls import path
from rest_framework.routers import SimpleRouter
from .assignment_views import KPIAssignmentViewSet

router = SimpleRouter()
router.register("kpi-assignments", KPIAssignmentViewSet, basename="kpi-assignments")

urlpatterns = router.urls
