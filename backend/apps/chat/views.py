# apps/chat/views.py
import secrets
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Prefetch
from django.utils import timezone
from .models import ChatRoom, ChatMessage, MessageReaction, RoomRead, RoomInvite
from .serializers import ChatRoomSerializer, ChatMessageSerializer


class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def get_queryset(self):
        user = self.request.user
        from apps.organisation.models import UserDepartment
        dept_ids = UserDepartment.objects.filter(user=user).values_list("department_id", flat=True)
        # Public department rooms in my departments, OR any room I'm a participant of.
        # Private rooms only show if I'm a participant (the participants clause covers it).
        return ChatRoom.objects.filter(
            Q(is_private=False, department_id__in=dept_ids) |
            Q(participants=user)
        ).distinct()

    def perform_create(self, serializer):
        # Map the frontend's `visibility` string to is_private, set group semantics.
        visibility = self.request.data.get("visibility", "public")
        room = serializer.save(
            created_by=self.request.user,
            is_direct=False,
            is_private=(visibility == "private"),
        )
        room.participants.add(self.request.user)
        # Optionally seed initial members passed from the create modal.
        member_ids = self.request.data.get("member_ids", [])
        if member_ids:
            from apps.accounts.models import User
            room.participants.add(*User.objects.filter(id__in=member_ids))

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        room = self.get_object()
        if not room.user_can_access(request.user):
            return Response({"error": "Access denied"}, status=403)
        msgs = (
            ChatMessage.objects.filter(room=room)
            .select_related("sender", "reply_to", "reply_to__sender")
            .prefetch_related("reactions")[:200]
        )
        data = ChatMessageSerializer(msgs, many=True, context={"request": request}).data
        # Opening the message list marks the room read (updates last_read_at).
        RoomRead.objects.update_or_create(
            room=room, user=request.user, defaults={"last_read_at": timezone.now()}
        )
        return Response(data)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        room = self.get_object()
        if not room.user_can_access(request.user):
            return Response({"error": "Access denied"}, status=403)
        content = request.data.get("content", "")
        if not content.strip():
            return Response({"error": "Empty message"}, status=400)
        reply_to_id = request.data.get("reply_to")
        reply_to = None
        if reply_to_id:
            reply_to = ChatMessage.objects.filter(id=reply_to_id, room=room).first()
        msg = ChatMessage.objects.create(
            room=room, sender=request.user, content=content, reply_to=reply_to
        )
        # Sending counts as reading up to now.
        RoomRead.objects.update_or_create(
            room=room, user=request.user, defaults={"last_read_at": timezone.now()}
        )
        return Response(ChatMessageSerializer(msg, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def react(self, request, pk=None):
        """Toggle a reaction: adds the (message,user,emoji) row if absent, removes it if present."""
        room = self.get_object()
        if not room.user_can_access(request.user):
            return Response({"error": "Access denied"}, status=403)
        message_id = request.data.get("message_id")
        emoji = (request.data.get("emoji") or "").strip()
        if not message_id or not emoji:
            return Response({"error": "message_id and emoji required"}, status=400)
        msg = ChatMessage.objects.filter(id=message_id, room=room).first()
        if not msg:
            return Response({"error": "Message not found"}, status=404)
        existing = MessageReaction.objects.filter(message=msg, user=request.user, emoji=emoji).first()
        if existing:
            existing.delete()
            reacted = False
        else:
            MessageReaction.objects.create(message=msg, user=request.user, emoji=emoji)
            reacted = True
        return Response({"success": True, "emoji": emoji, "reacted": reacted})

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        room = self.get_object()
        RoomRead.objects.update_or_create(
            room=room, user=request.user, defaults={"last_read_at": timezone.now()}
        )
        return Response({"success": True})

    @action(detail=True, methods=["post"])
    def create_invite(self, request, pk=None):
        """Generate a shareable invite link for a private room. Org-restricted +
        optional email allow-list. Only the creator (or a participant) may generate."""
        room = self.get_object()
        if room.created_by_id != request.user.id and not room.participants.filter(id=request.user.id).exists():
            return Response({"error": "Not allowed"}, status=403)
        allowed_emails = request.data.get("allowed_emails", [])
        invite = RoomInvite.objects.create(
            room=room,
            token=secrets.token_urlsafe(24),
            created_by=request.user,
            allowed_emails=allowed_emails,
        )
        # Build a frontend URL for the join page.
        base = request.data.get("base_url") or request.build_absolute_uri("/")[:-1]
        link = f"{base}/chat/join/{invite.token}"
        return Response({"success": True, "token": invite.token, "link": link})

    @action(detail=False, methods=["post"], url_path="join")
    def join(self, request):
        """Join a private room via invite token. Enforces org match AND allow-list."""
        token = request.data.get("token")
        invite = RoomInvite.objects.filter(token=token).select_related("room", "room__department").first()
        if not invite or not invite.is_valid():
            return Response({"error": "Invalid or expired invite"}, status=400)
        room = invite.room
        # Org restriction: the joining user's org must match the room's department org.
        if room.department and room.department.organisation_id != request.user.organisation_id:
            return Response({"error": "This invite is for another organisation"}, status=403)
        # Allow-list restriction.
        if not invite.email_allowed(request.user.email):
            return Response({"error": "This invite is not for your account"}, status=403)
        room.participants.add(request.user)
        return Response(ChatRoomSerializer(room, context={"request": request}).data)

    @action(detail=False, methods=["post"])
    def direct_message(self, request):
        other_user_id = request.data.get("user_id")
        if not other_user_id:
            return Response({"error": "user_id required"}, status=400)
        from apps.accounts.models import User
        other = User.objects.filter(id=other_user_id).first()
        if not other:
            return Response({"error": "User not found"}, status=404)
        room = (
            ChatRoom.objects.filter(is_direct=True)
            .filter(participants=request.user).filter(participants=other).first()
        )
        if not room:
            room = ChatRoom.objects.create(
                name=f"DM: {request.user.full_name} & {other.full_name}",
                is_direct=True, created_by=request.user,
            )
            room.participants.add(request.user, other)
        return Response(ChatRoomSerializer(room, context={"request": request}).data)