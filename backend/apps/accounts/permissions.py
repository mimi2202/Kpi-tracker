"""RBAC permissions."""
from rest_framework import permissions
from .models import Role


class IsAdminOrSelf(permissions.BasePermission):
    """Allow admins full access, users can only access their own data."""
    def has_object_permission(self, request, view, obj):
        if request.user.role == Role.ADMIN:
            return True
        return obj == request.user


class HasRole(permissions.BasePermission):
    """Permission that checks user role."""
    def __init__(self, roles):
        self.roles = roles if isinstance(roles, list) else [roles]

    def __call__(self):
        return self

    def has_permission(self, request, view):
        return request.user.role in self.roles


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.ADMIN


class IsAdminOrTeamLeader(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [Role.ADMIN, Role.TEAM_LEADER]


class IsDepartmentManager(permissions.BasePermission):
    """Allow department managers to access their department data."""
    def has_object_permission(self, request, view, obj):
        if request.user.role in [Role.ADMIN, Role.TEAM_LEADER]:
            return True
        department = getattr(obj, "department", None)
        if department:
            return request.user.department_links.filter(department=department, is_department_head=True).exists()
        return False


class IsOwnerOrManager(permissions.BasePermission):
    """Allow access if user is admin, the user's team leader, or the user themselves."""
    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == Role.ADMIN:
            return True
        if user.role == Role.TEAM_LEADER:
            if hasattr(obj, 'responsible_person'):
                return obj.responsible_person_id in user.team_members.values_list('id', flat=True) or obj.responsible_person == user
            if hasattr(obj, 'manager'):
                return obj.manager == user or obj == user
        if hasattr(obj, 'responsible_person'):
            return obj.responsible_person == user
        return obj == user


class OrganisationPermission(permissions.BasePermission):
    """Filter querysets to user's organisation."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.organisation is not None
