# backend/apps/accounts/serializers.py
"""Authentication and user serializers."""
from django.contrib.auth import authenticate
from django.db.models import Avg
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User, Organisation, Role
from apps.organisation.models import UserDepartment


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom JWT serializer that includes user info in token."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["email"] = user.email
        token["organisation_id"] = str(user.organisation_id) if user.organisation_id else None
        return token


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = data.get("email")
        password = data.get("password")
        if not (email and password):
            raise serializers.ValidationError("Email and password are required.")

        user = authenticate(request=self.context.get("request"), email=email, password=password)
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("Account is deactivated.")

        data["user"] = user
        return data


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)


class OrganisationSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = Organisation
        fields = [
            "id", "name", "slug", "logo", "created_by", "created_by_name",
            "member_count", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at"]

    def get_member_count(self, obj):
        return obj.members.count()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    display_title = serializers.ReadOnlyField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    manager_name = serializers.CharField(source="manager.full_name", read_only=True)
    team_size = serializers.SerializerMethodField()
    departments = serializers.SerializerMethodField()
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "organisation", "role", "role_display", "title", "display_title",
            "custom_title", "manager", "manager_name", "team_size",
            "job_title", "phone", "is_active", "avatar", "departments",
            "theme_preference", "email_notifications", "period_reminders",
            "created_at", "updated_at",
        ]
        # organisation is server-managed; never let the client reassign it here.
        read_only_fields = [
            "id", "created_at", "updated_at", "full_name", "display_title",
            "role_display", "manager_name", "team_size", "organisation",
        ]

    def get_team_size(self, obj):
        if obj.role in [Role.ADMIN, Role.TEAM_LEADER]:
            return obj.team_members.count()
        return 0

    def get_departments(self, obj):
        deps = UserDepartment.objects.filter(user=obj).select_related("department")
        return [
            {"id": d.department_id, "name": d.department.name, "is_head": d.is_department_head}
            for d in deps
        ]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    # Read-only: organisation is injected server-side from the creating admin
    # via the ViewSet's perform_create (serializer.save(organisation=...)).
    organisation = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "first_name", "last_name",
            "role", "title", "custom_title", "manager", "organisation",
        ]

    def validate_manager(self, manager):
        request = self.context["request"]
        if manager and manager.organisation_id != request.user.organisation_id:
            raise serializers.ValidationError("Manager must be in your organisation.")
        return manager

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)  # organisation arrives via save() kwarg
        user.set_password(password)
        user.save()
        return user
    
    def validate_organisation_name(self, value):   # adjust field name to your serializer
        from apps.accounts.models import Organisation  # adjust import
        if Organisation.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError(
                "An organisation with this name already exists. Please choose another, or sign in instead."
            )
        return value


class TeamMemberSerializer(serializers.ModelSerializer):
    """For listing team members under a leader/admin."""
    full_name = serializers.ReadOnlyField()
    display_title = serializers.ReadOnlyField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    kpi_progress = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "full_name", "email", "role", "role_display",
            "title", "display_title", "kpi_progress", "is_active",
        ]

    def get_kpi_progress(self, obj):
        from apps.results.models import KPIResult
        results = KPIResult.objects.filter(responsible_person=obj)
        avg = (
            results.exclude(achievement_percentage__isnull=True)
            .aggregate(avg=Avg("achievement_percentage"))["avg"]
        )
        return round(float(avg), 1) if avg else None


class UserDepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserDepartment
        fields = ["id", "user", "department", "is_department_head", "is_primary"]