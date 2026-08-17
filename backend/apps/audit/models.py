"""Audit log model. Every entry is written via core.audit.log_action from
elsewhere in the app — nothing in this app creates entries itself.
"""
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AuditLog(UUIDPrimaryKeyMixin, TimestampMixin):
    organisation = models.ForeignKey(
        "accounts.Organisation",
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="audit_logs",
        help_text="Null if the actor's account was later deleted, the log entry itself is kept.",
    )
    action = models.CharField(max_length=200)
    target = models.CharField(max_length=300, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organisation", "created_at"]),
        ]

    def __str__(self):
        who = self.user.full_name if self.user else "System"
        return f"{who} - {self.action} - {self.target}"