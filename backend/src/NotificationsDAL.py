from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Sequence

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from model import NotificationData, NotificationType


def _to_object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class NotificationsDAL:
    """Data access layer for storing and retrieving user notifications."""

    def __init__(self, collection: AsyncIOMotorCollection):
        self._collection = collection

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("recipient_id", 1), ("created_at", -1)])

    async def create_notification(
        self,
        *,
        recipient_id: str | ObjectId,
        notification_type: NotificationType,
        title: str,
        body: str,
        url: str | None = None,
    ) -> NotificationData:
        now = datetime.now(timezone.utc)
        doc = {
            "recipient_id": _to_object_id(recipient_id),
            "type": notification_type.value,
            "title": title,
            "body": body,
            "url": url,
            "created_at": now,
            "read": False,
            "read_at": None,
        }
        result = await self._collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return NotificationData.from_doc(doc)

    async def create_notifications(
        self,
        notifications: Iterable[tuple[str | ObjectId, NotificationType, str, str, str | None]],
    ) -> list[NotificationData]:
        docs: list[dict] = []
        now = datetime.now(timezone.utc)
        for recipient_id, notification_type, title, body, url in notifications:
            try:
                object_id = _to_object_id(recipient_id)
            except Exception:
                continue
            docs.append(
                {
                    "recipient_id": object_id,
                    "type": notification_type.value,
                    "title": title,
                    "body": body,
                    "url": url,
                    "created_at": now,
                    "read": False,
                    "read_at": None,
                }
            )
        if not docs:
            return []
        result = await self._collection.insert_many(docs)
        out: list[NotificationData] = []
        for inserted_id, doc in zip(result.inserted_ids, docs):
            doc["_id"] = inserted_id
            out.append(NotificationData.from_doc(doc))
        return out

    async def list_notifications(
        self,
        recipient_id: str | ObjectId,
        *,
        limit: int = 25,
    ) -> list[NotificationData]:
        cursor = (
            self._collection.find({"recipient_id": _to_object_id(recipient_id)})
            .sort("created_at", -1)
            .limit(limit)
        )
        notifications: list[NotificationData] = []
        async for doc in cursor:
            notifications.append(NotificationData.from_doc(doc))
        return notifications

    async def mark_as_read(
        self,
        notification_id: str | ObjectId,
        *,
        read: bool = True,
        recipient_id: str | ObjectId | None = None,
    ) -> NotificationData | None:
        update: dict[str, object] = {"read": read}
        if read:
            update["read_at"] = datetime.now(timezone.utc)
        else:
            update["read_at"] = None
        filter_query: dict[str, object] = {"_id": _to_object_id(notification_id)}
        if recipient_id is not None:
            try:
                filter_query["recipient_id"] = _to_object_id(recipient_id)
            except Exception:
                return None
        result = await self._collection.find_one_and_update(
            filter_query,
            {"$set": update},
            return_document=True,
        )
        if not result:
            return None
        return NotificationData.from_doc(result)

    async def mark_all_as_read(self, recipient_id: str | ObjectId) -> int:
        result = await self._collection.update_many(
            {"recipient_id": _to_object_id(recipient_id), "read": False},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc)}},
        )
        return int(result.modified_count)

    async def clear_notifications(self, recipient_id: str | ObjectId) -> int:
        result = await self._collection.delete_many({"recipient_id": _to_object_id(recipient_id)})
        return int(result.deleted_count)


class PushSubscriptionDAL:
    """Stores web push subscriptions for each user."""

    def __init__(self, collection: AsyncIOMotorCollection):
        self._collection = collection

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("user_id", 1)])
        await self._collection.create_index([("endpoint", 1)], unique=True)

    async def save_subscription(self, *, user_id: str | ObjectId, subscription: dict) -> None:
        payload = {
            "endpoint": subscription.get("endpoint"),
            "keys": subscription.get("keys", {}),
            "expirationTime": subscription.get("expirationTime"),
        }
        await self._collection.update_one(
            {"endpoint": payload["endpoint"]},
            {
                "$set": {
                    "user_id": _to_object_id(user_id),
                    "subscription": payload,
                    "updated_at": datetime.now(timezone.utc),
                },
                "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )

    async def remove_subscription(self, *, user_id: str | ObjectId, endpoint: str) -> bool:
        result = await self._collection.delete_one(
            {"user_id": _to_object_id(user_id), "endpoint": endpoint}
        )
        return result.deleted_count == 1

    async def remove_by_endpoint(self, endpoint: str) -> bool:
        result = await self._collection.delete_one({"endpoint": endpoint})
        return result.deleted_count == 1

    async def list_subscriptions(self, user_ids: Sequence[str | ObjectId]) -> list[dict]:
        object_ids: list[ObjectId] = []
        for user_id in user_ids:
            try:
                object_ids.append(_to_object_id(user_id))
            except Exception:
                continue
        if not object_ids:
            return []
        cursor = self._collection.find({"user_id": {"$in": object_ids}})
        subscriptions: list[dict] = []
        async for doc in cursor:
            data = doc.get("subscription", {})
            if not data.get("endpoint"):
                continue
            subscriptions.append(
                {
                    "endpoint": data.get("endpoint"),
                    "keys": data.get("keys", {}),
                    "expirationTime": data.get("expirationTime"),
                    "user_id": str(doc.get("user_id")),
                }
            )
        return subscriptions

    async def remove_all_for_user(self, user_id: str | ObjectId) -> int:
        try:
            object_id = _to_object_id(user_id)
        except Exception:
            return 0
        result = await self._collection.delete_many({"user_id": object_id})
        return int(result.deleted_count)
