# backend/apps/accounts/models.py
"""User, Role, and Permission models."""
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin, SoftDeleteMixin


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class Role(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    TEAM_LEADER = "TEAM_LEADER", "Team Leader"
    MEMBER = "MEMBER", "Member"


class Title(models.TextChoices):
    TECHNICAL_SUPPORT = "TECHNICAL_SUPPORT", "Technical Support"
    INTERN = "INTERN", "Intern"
    ANALYST = "ANALYST", "Analyst"
    ENGINEER = "ENGINEER", "Engineer"
    MANAGER = "MANAGER", "Manager"
    DIRECTOR = "DIRECTOR", "Director"
    COORDINATOR = "COORDINATOR", "Coordinator"
    SPECIALIST = "SPECIALIST", "Specialist"
    CONSULTANT = "CONSULTANT", "Consultant"
    OTHER = "OTHER", "Other"


class Organisation(UUIDPrimaryKeyMixin, TimestampMixin):
    """Top-level organization."""
    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(max_length=200, unique=True)
    logo = models.ImageField(upload_to="logos/", null=True, blank=True)
    created_by = models.ForeignKey(
        "User",
        on_delete=models.PROTECT,
        related_name="created_organisations",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "organisations"

    def __str__(self):
        return self.name


class User(AbstractUser, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Custom User model with organization membership."""
    username = None
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)

    # Organization & Role
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="members",
        null=True, blank=True,
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    title = models.CharField(
        max_length=30,
        choices=Title.choices,
        default=Title.OTHER,
        blank=True,
    )
    custom_title = models.CharField(max_length=100, blank=True, help_text="Custom job title if 'Other' selected")

    # Manager relationship
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="team_members",
        help_text="Team leader or admin who manages this user",
    )

    # Profile
    job_title = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)
    theme_preference = models.CharField(
        max_length=10,
        choices=[("system", "System"), ("light", "Light"), ("dark", "Dark")],
        default="system",
    )
    period_reminders = models.BooleanField(default=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    notification_preferences = models.JSONField(default=dict, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        db_table = "users"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def display_title(self):
        if self.title == Title.OTHER and self.custom_title:
            return self.custom_title
        return self.get_title_display()

    @property
    def is_admin(self):
        return self.role == Role.ADMIN

    @property
    def is_team_leader(self):
        return self.role == Role.TEAM_LEADER

    @property
    def is_member(self):
        return self.role == Role.MEMBER

    def get_visible_users(self):
        if self.role == Role.ADMIN:
            return User.objects.filter(organisation=self.organisation)
        elif self.role == Role.TEAM_LEADER:
            from apps.organisation.models import UserDepartment
            dept_ids = UserDepartment.objects.filter(user=self, is_department_head=True).values_list('department_id', flat=True)
            if dept_ids:
                member_ids = UserDepartment.objects.filter(department_id__in=dept_ids).values_list('user_id', flat=True)
                return User.objects.filter(id__in=member_ids)
            return User.objects.filter(id=self.id)
        else:
            return User.objects.filter(id=self.id)

    def get_visible_departments(self):
        """Get departments this user can see."""
        from apps.organisation.models import Department
        if self.role == Role.ADMIN:
            return Department.objects.filter(organisation=self.organisation, is_active=True)
        elif self.role == Role.TEAM_LEADER:
            team_ids = list(self.team_members.values_list("id", flat=True))
            team_ids.append(self.id)
            return Department.objects.filter(user_links__user_id__in=team_ids, is_active=True).distinct()
        else:
            return Department.objects.filter(user_links__user=self, is_active=True)

    # apps/accounts/models.py  (User model)
# REPLACE get_visible_kpi_results with this. ADMIN is now bounded to the user's
# organisation (was KPIResult.objects.all() — a cross-org leak on the dashboard).

    def get_visible_kpi_results(self):
        """KPI results this user can see. ALWAYS returns a QuerySet, ALWAYS org-scoped."""
        from apps.results.models import KPIResult
        from apps.organisation.models import UserDepartment
        from django.db.models import Q

        base = KPIResult.objects.filter(department__organisation_id=self.organisation_id)

        # Admin: everything in THEIR organisation (not all orgs).
        if self.role == Role.ADMIN:
            return base

        # Team leader: departments they head, plus their own rows.
        if self.role == Role.TEAM_LEADER:
            head_dept_ids = UserDepartment.objects.filter(
                user=self, is_department_head=True
            ).values_list("department_id", flat=True)
            return base.filter(
                Q(department_id__in=head_dept_ids) | Q(responsible_person=self)
            )

        # Member (or any other role): their department's rows + anything assigned to them.
        dept_ids = UserDepartment.objects.filter(user=self).values_list("department_id", flat=True)
        return base.filter(
            Q(department_id__in=dept_ids) | Q(responsible_person=self)
        )
 
            

    def get_kpi_progress(self):
        """Get average KPI achievement for this user."""
        from apps.results.models import KPIResult
        from django.db.models import Avg
        avg = KPIResult.objects.filter(responsible_person=self).exclude(
            achievement_percentage__isnull=True
        ).aggregate(avg=Avg("achievement_percentage"))["avg"]
        return round(float(avg), 1) if avg else None










