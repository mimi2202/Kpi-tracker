# backend/apps/accounts/views.py
"""Authentication views."""
import secrets

from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils.text import slugify
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from core.organisation_mixins import OrganisationScopedMixin
from apps.organisation.models import UserDepartment
from .models import User, Organisation, Role
from .permissions import IsAdminOrSelf
from .serializers import (
    OrganisationSerializer,
    CustomTokenObtainPairSerializer,
    LoginSerializer,
    UserSerializer,
    UserCreateSerializer,
    UserDepartmentSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)


class LoginView(TokenObtainPairView):
    """JWT login endpoint."""
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        return Response({
            "success": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user, context={"request": request}).data,
        })


class UserViewSet(OrganisationScopedMixin, viewsets.ModelViewSet):
    """User management viewset. Scoped to the caller's organisation."""
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = User.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsAdminOrSelf]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    @action(detail=False, methods=["get"])
    def me(self, request):
        serializer = UserSerializer(request.user, context={"request": request})
        data = serializer.data
        if request.user.organisation:
            data["organisation_name"] = request.user.organisation.name
            data["organisation_id"] = str(request.user.organisation.id)
            if request.user.organisation.logo:
                data["organisation_logo"] = request.user.organisation.logo.url
        return Response(data)

    @action(detail=False, methods=["post"])
    def logout(self, request):
        try:
            token = RefreshToken(request.data.get("refresh"))
            token.blacklist()
        except Exception:
            pass
        return Response({"success": True})

    @action(detail=False, methods=["post"], permission_classes=[permissions.AllowAny])
    def forgot_password(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        try:
            user = User.objects.get(email=email)
            token = default_token_generator.make_token(user)
            send_mail("Password Reset", f"Token: {token}", "noreply@ips.com", [email])
        except User.DoesNotExist:
            pass
        return Response({"success": True, "message": "If the email exists, a reset link has been sent."})

    @action(detail=False, methods=["post"], permission_classes=[permissions.AllowAny])
    
    @action(detail=False, methods=["post"])
    def change_password(self, request):
        """Change password for authenticated user."""
        current = request.data.get("current_password")
        new = request.data.get("new_password")
        if not current or not new:
            return Response({"errors": ["Both current and new password are required"]}, status=400)
        if not request.user.check_password(current):
            return Response({"errors": ["Current password is incorrect"]}, status=400)
        request.user.set_password(new)
        request.user.save()
        return Response({"success": True, "message": "Password changed."})

    def reset_password(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"success": True})

    @action(detail=False, methods=["get"])
    def my_team(self, request):
        """Get team members based on the caller's role."""
        user = request.user
        if user.role in [Role.ADMIN, Role.TEAM_LEADER]:
            members = user.get_visible_users()
        else:
            members = User.objects.filter(id=user.id)

        data = [{
            "id": str(m.id),
            "full_name": m.full_name,
            "email": m.email,
            "role": m.role,
            "role_display": m.get_role_display(),
            "title": m.title,
            "display_title": m.display_title,
            "kpi_progress": m.get_kpi_progress() if hasattr(m, "get_kpi_progress") else None,
            "is_active": m.is_active,
            "team_size": m.team_members.count() if m.role in [Role.ADMIN, Role.TEAM_LEADER] else 0,
        } for m in members]
        return Response(data)

    @action(detail=True, methods=["post"])
    def assign_role(self, request, pk=None):
        if request.user.role != Role.ADMIN:
            return Response({"error": "Only admins can assign roles"}, status=403)

        target_user = self.get_object()  # org-scoped via get_queryset
        new_role = request.data.get("role")
        new_title = request.data.get("title")
        new_manager_id = request.data.get("manager_id")

        if new_role and new_role in dict(Role.choices):
            target_user.role = new_role
        if new_title:
            target_user.title = new_title
        if new_manager_id:
            # Manager must be in the same organisation.
            manager = User.objects.filter(
                id=new_manager_id, organisation_id=request.user.organisation_id
            ).first()
            if not manager:
                return Response({"error": "Manager must be in your organisation"}, status=400)
            target_user.manager = manager

        target_user.save()
        return Response(UserSerializer(target_user, context={"request": request}).data)

    @action(detail=False, methods=["post"], permission_classes=[permissions.AllowAny])
    def register(self, request):
        """Register a new organisation together with its first admin user."""
        org_name = request.data.get("organisation_name")
        email = request.data.get("email")
        password = request.data.get("password")
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        title = request.data.get("title", "DIRECTOR")
        logo = request.FILES.get("logo")

        if not all([org_name, email, password, first_name, last_name]):
            return Response({"errors": ["All fields are required"]}, status=400)
        if User.objects.filter(email=email).exists():
            return Response({"errors": ["Email already in use"]}, status=400)

        slug = slugify(org_name)
        if Organisation.objects.filter(slug=slug).exists():
            slug = f"{slug}-{secrets.token_hex(4)}"

        # Org + first admin are created atomically: never a half-built tenant.
        with transaction.atomic():
            org = Organisation.objects.create(name=org_name, slug=slug)
            if logo:
                org.logo = logo
                org.save()

            user = User.objects.create_user(
                email=email, password=password,
                first_name=first_name, last_name=last_name,
                organisation=org, role=Role.ADMIN, title=title,
            )
            org.created_by = user
            org.save()

        refresh = RefreshToken.for_user(user)
        return Response({
            "success": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user, context={"request": request}).data,
            "organisation": OrganisationSerializer(org).data,
        })


class OrganisationViewSet(viewsets.ModelViewSet):
    """Read-only; a user only ever sees their own organisation."""
    serializer_class = OrganisationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        # Organisation IS the tenant boundary, so it can't use the standard
        # mixin (it has no parent 'organisation' field). Scope by identity.
        org_id = getattr(self.request.user, "organisation_id", None)
        if not org_id:
            return Organisation.objects.none()
        return Organisation.objects.filter(id=org_id)


class UserDepartmentViewSet(viewsets.ModelViewSet):
    queryset = UserDepartment.objects.all()
    serializer_class = UserDepartmentSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']
    # UserDepartment has no direct organisation FK; it reaches org via department.
    org_lookup = "department__organisation"
    org_save_field = None  # nothing to inject; org is implied by the department

    def perform_create(self, serializer):
        org_id = getattr(self.request.user, "organisation_id", None)
        if not org_id:
            raise ValidationError("Your account is not attached to an organisation.")
        user = serializer.validated_data.get("user")
        dept = serializer.validated_data.get("department")
        if user and user.organisation_id != org_id:
            raise ValidationError("User is not in your organisation.")
        if dept and getattr(dept, "organisation_id", None) != org_id:
            raise ValidationError("Department is not in your organisation.")
        serializer.save()




