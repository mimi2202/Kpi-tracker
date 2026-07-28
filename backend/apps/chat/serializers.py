# apps/chat/serializers.py
from rest_framework import serializers
from .models import ChatRoom, ChatMessage, MessageReaction


class ReactionSummarySerializer(serializers.Serializer):
    """Slack-style grouped reactions: emoji, count, and whether *I* reacted."""
    emoji = serializers.CharField()
    count = serializers.IntegerField()
    reacted = serializers.BooleanField()


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    sender_initials = serializers.SerializerMethodField()
    sender_avatar = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    reply_to_preview = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = [
            "id", "content", "sender", "sender_name", "sender_initials",
            "sender_avatar", "created_at", "reply_to", "reply_to_preview", "reactions",
        ]

    def get_sender_initials(self, obj):
        f = (obj.sender.first_name or " ")[:1]
        l = (obj.sender.last_name or " ")[:1]
        return (f + l).upper().strip() or "?"

    def get_sender_avatar(self, obj):
        if getattr(obj.sender, "avatar", None):
            request = self.context.get("request")
            url = obj.sender.avatar.url
            return request.build_absolute_uri(url) if request else url
        return None

    def get_reply_to_preview(self, obj):
        if not obj.reply_to_id:
            return None
        r = obj.reply_to
        return {
            "id": str(r.id),
            "sender_name": r.sender.full_name if r.sender_id else "",
            "content": (r.content or "")[:120],
        }

    def get_reactions(self, obj):
        # Group this message's reactions by emoji, with counts and whether the
        # current user reacted. Uses prefetched .reactions.all() when available.
        me = None
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            me = request.user.id
        buckets = {}
        for r in obj.reactions.all():
            b = buckets.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "reacted": False})
            b["count"] += 1
            if me and r.user_id == me:
                b["reacted"] = True
        # Stable order by count desc then emoji
        return sorted(buckets.values(), key=lambda x: (-x["count"], x["emoji"]))


class ChatRoomSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True, default="")
    unread_count = serializers.SerializerMethodField()
    has_unread = serializers.SerializerMethodField()
    is_direct = serializers.BooleanField(read_only=True)
    is_private = serializers.BooleanField(read_only=True)

    class Meta:
        model = ChatRoom
        fields = [
            "id", "name", "department", "department_name",
            "is_direct", "is_private", "unread_count", "has_unread",
        ]

    def _unread_qs(self, obj):
        from .models import RoomRead, ChatMessage
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return ChatMessage.objects.none()
        read = RoomRead.objects.filter(room=obj, user=request.user).first()
        qs = ChatMessage.objects.filter(room=obj).exclude(sender=request.user)
        if read:
            qs = qs.filter(created_at__gt=read.last_read_at)
        return qs

    def get_unread_count(self, obj):
        return self._unread_qs(obj).count()

    def get_has_unread(self, obj):
        return self._unread_qs(obj).exists()