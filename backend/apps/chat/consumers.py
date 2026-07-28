import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import ChatRoom, ChatMessage


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"chat_{self.room_id}"
        
        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        
        # Send recent messages
        messages = await self.get_recent_messages()
        await self.send(text_data=json.dumps({
            "type": "history",
            "messages": messages,
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data.get("message", "")
        user = self.scope["user"]
        
        if message.strip() and user.is_authenticated:
            # Save to database
            msg = await self.save_message(user, message)
            
            # Broadcast to room
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat_message",
                    "message": message,
                    "sender_id": str(user.id),
                    "sender_name": user.full_name,
                    "sender_initials": f"{user.first_name[0]}{user.last_name[0]}",
                    "timestamp": msg.created_at.strftime("%H:%M"),
                }
            )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "message",
            "message": event["message"],
            "sender_id": event["sender_id"],
            "sender_name": event["sender_name"],
            "sender_initials": event["sender_initials"],
            "timestamp": event["timestamp"],
        }))

    @database_sync_to_async
    def get_recent_messages(self):
        messages = ChatMessage.objects.filter(room_id=self.room_id).select_related("sender")[:50]
        return [
            {
                "message": m.content,
                "sender_id": str(m.sender_id),
                "sender_name": m.sender.full_name,
                "sender_initials": f"{m.sender.first_name[0]}{m.sender.last_name[0]}",
                "timestamp": m.created_at.strftime("%H:%M"),
            }
            for m in messages
        ]

    @database_sync_to_async
    def save_message(self, user, message):
        room = ChatRoom.objects.get(id=self.room_id)
        return ChatMessage.objects.create(room=room, sender=user, content=message)
