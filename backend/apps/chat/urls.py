from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import ChatRoomViewSet

router = SimpleRouter()
router.register("chat-rooms", ChatRoomViewSet, basename="chat-rooms")

urlpatterns = router.urls
