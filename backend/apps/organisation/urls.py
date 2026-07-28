# backend/apps/organisation/urls.py
"""Organisation URLs."""
from rest_framework.routers import SimpleRouter
from .views import DepartmentViewSet

router = SimpleRouter()
router.register("departments", DepartmentViewSet, basename="departments")

urlpatterns = router.urls