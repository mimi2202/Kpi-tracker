from rest_framework.routers import SimpleRouter
from .views import AuditLogViewSet

app_name = 'audit'

router = SimpleRouter()
router.register("audit-logs", AuditLogViewSet, basename="audit-logs")

urlpatterns = router.urls