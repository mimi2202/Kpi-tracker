# apps/chat/models.py
from django.db import models
from core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ChatRoom(models.Model):
    department = models.ForeignKey(
        "organisation.Department",
        on_delete=models.CASCADE,
        related_name="chat_rooms",
        null=True, blank=True,
    )
    name = models.CharField(max_length=200)
    is_direct = models.BooleanField(default=False)
    is_private = models.BooleanField(default=False)
    participants = models.ManyToManyField(
        "accounts.User",
        related_name="chat_rooms",
        blank=True,
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_chat_rooms",
    )

    class Meta:
        db_table = "chat_rooms"

    def __str__(self):
        return self.name

    def user_can_access(self, user):
        if self.is_direct:
            return self.participants.filter(id=user.id).exists()
        if self.is_private:
            # Private rooms: must be an explicit participant.
            return self.participants.filter(id=user.id).exists()
        if not self.department:
            return True
        # Public department room: any member of the department can access.
        from apps.organisation.models import UserDepartment
        return UserDepartment.objects.filter(user=user, department=self.department).exists()


class ChatMessage(UUIDPrimaryKeyMixin, TimestampMixin):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="chat_messages")
    content = models.TextField()
    # Reply-to: points at the message being replied to (null = top-level message).
    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="replies",
    )

    class Meta:
        db_table = "chat_messages"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender}: {self.content[:50]}"


class MessageReaction(TimestampMixin):
    """Slack-style reaction: one row per (message, user, emoji). Toggled on/off."""
    message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="message_reactions")
    emoji = models.CharField(max_length=32)  # store the unicode emoji itself, e.g. "👍"

    class Meta:
        db_table = "chat_message_reactions"
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user", "emoji"],
                name="unique_message_user_emoji",
            ),
        ]
        indexes = [models.Index(fields=["message", "emoji"])]


class RoomRead(models.Model):
    """Tracks the last time a user read a room, for unread dot + count."""
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="reads")
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="room_reads")
    last_read_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chat_room_reads"
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="unique_room_user_read"),
        ]


class RoomInvite(UUIDPrimaryKeyMixin, TimestampMixin):
    """Shareable invite link for a private room. Org-restricted AND allow-listed:
    a link only works if the joining user is in the same org as the room's
    department AND their email is on the invite's allow-list."""
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="invites")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="chat_invites_created"
    )
    # Allow-list of emails permitted to use this link (case-insensitive match).
    allowed_emails = models.JSONField(default=list, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "chat_room_invites"

    def is_valid(self):
        from django.utils import timezone
        if not self.is_active:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True

    def email_allowed(self, email):
        if not self.allowed_emails:
            return True  # empty allow-list = any org member may join
        return (email or "").lower() in [e.lower() for e in self.allowed_emails]