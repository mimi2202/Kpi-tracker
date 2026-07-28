# backend/apps/accounts/urls.py
"""Authentication URLs."""
from django.urls import path
from rest_framework.routers import SimpleRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, UserViewSet, OrganisationViewSet, UserDepartmentViewSet

router = SimpleRouter()
router.register("users", UserViewSet, basename="users")
router.register("organisations", OrganisationViewSet, basename="organisations")
router.register("user-departments", UserDepartmentViewSet, basename="user-departments")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
] + router.urls
