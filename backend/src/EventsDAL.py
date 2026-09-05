from bson import ObjectId
from typing import List, Optional, Dict, Any, Tuple, Sequence
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import uuid4
from bson import ObjectId


def _to_object_id(val: str | ObjectId) -> ObjectId:
    return val if isinstance(val, ObjectId) else ObjectId(val)


def _normalise_embedding(value: Any) -> Optional[List[float]]:
    if not isinstance(value, list):
        return None
    floats: List[float] = []
    for item in value:
        try:
            floats.append(float(item))
        except (TypeError, ValueError):
            return None
    return floats if floats else None

class EventLink(BaseModel):
    label: str
    url: str

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "EventLink":
        return EventLink(label=doc.get("label", ""), url=doc.get("url", ""))


class EventRSVPAttendee(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    rsvp_at: datetime
    reward_redeemed_at: Optional[datetime] = None
    reward_points_awarded: Optional[int] = None

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "EventRSVPAttendee":
        return EventRSVPAttendee(
            user_id=str(doc.get("user_id")),
            user_name=doc.get("user_name", ""),
            user_email=doc.get("user_email", ""),
            rsvp_at=doc.get("rsvp_at"),
            reward_redeemed_at=doc.get("reward_redeemed_at"),
            reward_points_awarded=doc.get("reward_points_awarded"),
        )


class EventRSVPDetails(BaseModel):
    enabled: bool = False
    key: Optional[str] = None
    reward_points: Optional[int] = None
    attendees: List[EventRSVPAttendee] = Field(default_factory=list)
    qr_code_url: Optional[str] = None
    qr_code_blob_name: Optional[str] = Field(default=None, exclude=True)

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "EventRSVPDetails":
        attendees = [
            EventRSVPAttendee.from_doc(attendee)
            for attendee in doc.get("attendees", [])
        ]
        return EventRSVPDetails(
            enabled=bool(doc.get("enabled", False)),
            key=doc.get("key"),
            reward_points=doc.get("reward_points"),
            attendees=attendees,
            qr_code_url=doc.get("qr_code_url"),
            qr_code_blob_name=doc.get("qr_code_blob_name"),
        )


class EventData(BaseModel):
    id: str
    title: str
    sub_header: Optional[str] = Field(default=None)
    body: str
    url: Optional[str] = Field(default=None)
    created_at: datetime
    updated_at: Optional[datetime] = None
    rsvp: Optional[EventRSVPDetails] = None
    links: List[EventLink] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "EventData":
        return EventData(
            id=str(doc["_id"]),
            title=doc["title"],
            sub_header=doc.get("sub_header"),
            body=doc["body"],
            url=doc["url"],
            created_at=doc["created_at"],
            updated_at=doc.get("updated_at"),
            rsvp=EventRSVPDetails.from_doc(doc["rsvp"]) if doc.get("rsvp") else None,
            links=[EventLink.from_doc(link) for link in doc.get("links", [])],
            tags=[
                str(tag)
                for tag in doc.get("tags", [])
                if isinstance(tag, (str, bytes)) and str(tag).strip()
            ],
        )


class EventsDAL:


    def __init__(self, events: AsyncIOMotorCollection):
        self.__events = events

    async def create_event(
        self,
        *,
        title: str,
        body: str,
        sub_header: Optional[str] = None,
        url: Optional[str] = None,
        rsvp_enabled: bool = False,
        rsvp_reward_points: Optional[int] = None,
        links: Optional[List[Dict[str, str]]] = None,
        tags: Optional[List[str]] = None,
        embedding: Optional[Sequence[float]] = None,
        session=None,
    ) -> EventData:
        now = datetime.now(timezone.utc)
        doc = {
            "title": title,
            "sub_header": sub_header,
            "body": body,
            "url": url,
            "created_at": now,
            "updated_at": now,
        }
        doc["links"] = [
            {"label": link.get("label", ""), "url": link.get("url", "")}
            for link in (links or [])
        ]
        doc["tags"] = tags or []
        if embedding is not None:
            doc["embedding"] = list(embedding)
        if rsvp_enabled:
            doc["rsvp"] = {
                "enabled": True,
                "key": uuid4().hex,
                "reward_points": rsvp_reward_points if rsvp_reward_points is not None else 0,
                "attendees": [],
                "qr_code_url": None,
                "qr_code_blob_name": None,
            }
        else:
            doc["rsvp"] = {
                "enabled": False,
                "key": None,
                "reward_points": None,
                "attendees": [],
                "qr_code_url": None,
                "qr_code_blob_name": None,
            }
        result = await self.__events.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return EventData.from_doc(doc)

    async def list_events(self, *, session=None) -> List[EventData]:
        cursor = self.__events.find({}, session=session).sort("created_at", -1)
        events: List[EventData] = []
        async for doc in cursor:
            events.append(EventData.from_doc(doc))
        return events

    async def list_rsvp_events_for_user(
        self, user_id: str | ObjectId, *, session=None
    ) -> List[EventData]:
        cursor = (
            self.__events.find(
                {
                    "rsvp.enabled": True,
                    "rsvp.attendees.user_id": _to_object_id(user_id),
                },
                session=session,
            )
            .sort("created_at", -1)
        )
        events: List[EventData] = []
        async for doc in cursor:
            events.append(EventData.from_doc(doc))
        return events

    async def delete_event(self, event_id: str | ObjectId) -> bool:
        result = await self.__events.delete_one({"_id": _to_object_id(event_id)})
        return result.deleted_count == 1

    async def get_event(self, event_id: str | ObjectId, *, session=None) -> Optional[EventData]:
        doc = await self.__events.find_one({"_id": _to_object_id(event_id)}, session=session)
        return EventData.from_doc(doc) if doc else None

    async def update_event(
        self,
        event_id: str | ObjectId,
        *,
        title: Optional[str] = None,
        sub_header: Optional[str] = None,
        body: Optional[str] = None,
        url: Optional[str] = None,
        rsvp_enabled: Optional[bool] = None,
        rsvp_reward_points: Optional[int] = None,
        links: Optional[List[Dict[str, str]]] = None,
        tags: Optional[List[str]] = None,
        embedding: Optional[Sequence[float]] = None,
        session=None,
    ) -> Optional[EventData]:
        object_id = _to_object_id(event_id)
        existing = await self.__events.find_one({"_id": object_id}, session=session)
        if not existing:
            return None

        update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if title is not None:
            update["title"] = title
        if sub_header is not None:
            update["sub_header"] = sub_header
        if body is not None:
            update["body"] = body
        if url is not None:
            update["url"] = url
        if links is not None:
            update["links"] = [
                {"label": link.get("label", ""), "url": link.get("url", "")}
                for link in links
            ]
        if tags is not None:
            update["tags"] = tags
        if embedding is not None:
            update["embedding"] = list(embedding)

        rsvp_doc = existing.get("rsvp") or {
            "enabled": False,
            "key": None,
            "reward_points": None,
            "attendees": [],
            "qr_code_url": None,
            "qr_code_blob_name": None,
        }
        if "qr_code_url" not in rsvp_doc:
            rsvp_doc["qr_code_url"] = None
        if "qr_code_blob_name" not in rsvp_doc:
            rsvp_doc["qr_code_blob_name"] = None
        rsvp_changed = False

        if rsvp_enabled is not None:
            if rsvp_enabled:
                if not rsvp_doc.get("enabled"):
                    rsvp_doc = {
                        "enabled": True,
                        "key": uuid4().hex,
                        "reward_points": rsvp_reward_points if rsvp_reward_points is not None else 0,
                        "attendees": [],
                        "qr_code_url": None,
                        "qr_code_blob_name": None,
                    }
                else:
                    rsvp_doc["enabled"] = True
                    if rsvp_doc.get("key") is None:
                        rsvp_doc["key"] = uuid4().hex
                    if rsvp_reward_points is not None:
                        rsvp_doc["reward_points"] = rsvp_reward_points
                    elif rsvp_doc.get("reward_points") is None:
                        rsvp_doc["reward_points"] = 0
                rsvp_changed = True
            else:
                rsvp_doc = {
                    "enabled": False,
                    "key": None,
                    "reward_points": None,
                    "attendees": [],
                    "qr_code_url": None,
                    "qr_code_blob_name": None,
                }
                rsvp_changed = True
        elif rsvp_reward_points is not None and rsvp_doc.get("enabled"):
            rsvp_doc["reward_points"] = rsvp_reward_points
            rsvp_changed = True

        if rsvp_changed:
            update["rsvp"] = rsvp_doc

        result = await self.__events.find_one_and_update(
            {"_id": object_id},
            {"$set": update},
            return_document=True,
            session=session,
        )
        return EventData.from_doc(result) if result else None

    async def set_rsvp_qr_code(
        self,
        event_id: str | ObjectId,
        *,
        qr_code_url: Optional[str],
        qr_code_blob_name: Optional[str],
        session=None,
    ) -> Optional[EventData]:
        result = await self.__events.find_one_and_update(
            {"_id": _to_object_id(event_id)},
            {
                "$set": {
                    "rsvp.qr_code_url": qr_code_url,
                    "rsvp.qr_code_blob_name": qr_code_blob_name,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=True,
            session=session,
        )
        return EventData.from_doc(result) if result else None

    async def add_rsvp(
        self,
        event_id: str | ObjectId,
        *,
        user_id: str | ObjectId,
        user_name: str,
        user_email: str,
        session=None,
    ) -> Optional[EventData]:
        object_id = _to_object_id(event_id)
        existing = await self.__events.find_one({"_id": object_id}, session=session)
        if not existing:
            return None

        rsvp_doc = existing.get("rsvp") or {}
        if not rsvp_doc.get("enabled"):
            return None

        attendee_id = _to_object_id(user_id)
        for attendee in rsvp_doc.get("attendees", []):
            if attendee.get("user_id") == attendee_id:
                return EventData.from_doc(existing)

        attendee_doc = {
            "user_id": attendee_id,
            "user_name": user_name,
            "user_email": user_email,
            "rsvp_at": datetime.now(timezone.utc),
            "reward_redeemed_at": None,
            "reward_points_awarded": None,
        }

        await self.__events.update_one(
            {"_id": object_id},
            {
                "$push": {"rsvp.attendees": attendee_doc},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
            session=session,
        )

        updated = await self.__events.find_one({"_id": object_id}, session=session)
        return EventData.from_doc(updated) if updated else None

    async def list_events_with_embeddings(
        self,
        *,
        session=None,
    ) -> List[Tuple[EventData, Optional[List[float]]]]:
        cursor = self.__events.find({}, session=session).sort("created_at", -1)
        events: List[Tuple[EventData, Optional[List[float]]]] = []
        async for doc in cursor:
            event = EventData.from_doc(doc)
            embedding = _normalise_embedding(doc.get("embedding"))
            events.append((event, embedding))
        return events

    async def get_events_with_embeddings(
        self,
        event_ids: Sequence[str],
        *,
        session=None,
    ) -> List[Tuple[EventData, Optional[List[float]]]]:
        object_ids: List[ObjectId] = []
        for value in event_ids:
            try:
                object_ids.append(_to_object_id(value))
            except Exception:
                continue

        if not object_ids:
            return []

        cursor = self.__events.find({"_id": {"$in": object_ids}}, session=session)
        events: List[Tuple[EventData, Optional[List[float]]]] = []
        async for doc in cursor:
            event = EventData.from_doc(doc)
            embedding = _normalise_embedding(doc.get("embedding"))
            events.append((event, embedding))
        return events

    async def update_event_embedding(
        self,
        event_id: str | ObjectId,
        *,
        embedding: Sequence[float],
        session=None,
    ) -> None:
        await self.__events.update_one(
            {"_id": _to_object_id(event_id)},
            {"$set": {"embedding": list(embedding)}},
            session=session,
        )

    async def redeem_rsvp_reward(
        self,
        *,
        rsvp_key: str,
        user_id: str | ObjectId,
        session=None,
    ) -> Optional[tuple[EventData, str]]:
        existing = await self.__events.find_one({"rsvp.key": rsvp_key}, session=session)
        if not existing:
            return None

        rsvp_doc = existing.get("rsvp") or {}
        if not rsvp_doc.get("enabled"):
            return None

        attendee_id = _to_object_id(user_id)
        attendees = rsvp_doc.get("attendees", [])
        for attendee in attendees:
            if attendee.get("user_id") == attendee_id:
                if attendee.get("reward_redeemed_at"):
                    return EventData.from_doc(existing), "already_redeemed"

                now = datetime.now(timezone.utc)
                await self.__events.update_one(
                    {"_id": existing["_id"], "rsvp.attendees.user_id": attendee_id},
                    {
                        "$set": {
                            "rsvp.attendees.$.reward_redeemed_at": now,
                            "rsvp.attendees.$.reward_points_awarded": rsvp_doc.get("reward_points", 0),
                            "updated_at": now,
                        }
                    },
                    session=session,
                )

                updated = await self.__events.find_one({"_id": existing["_id"]}, session=session)
                if not updated:
                    return None

                return EventData.from_doc(updated), "redeemed"

        return EventData.from_doc(existing), "attendee_missing"
