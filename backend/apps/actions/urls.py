from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import CorrectiveActionViewSet

router = SimpleRouter()
router.register("actions", CorrectiveActionViewSet, basename="actions")

urlpatterns = router.urls