from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field


def _to_object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class FeedbackStatus(str, Enum):
    NEW = "New"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"


class FeedbackData(BaseModel):
    id: str
    user_id: str = Field(alias="userId")
    user_name: str = Field(alias="userName")
    user_email: str = Field(alias="userEmail")
    category: str | None = None
    message: str
    status: FeedbackStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        allow_population_by_field_name = True

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "FeedbackData":
        return FeedbackData(
            id=str(doc["_id"]),
            userId=str(doc["user_id"]),
            userName=doc.get("user_name", ""),
            userEmail=doc.get("user_email", ""),
            category=doc.get("category") or doc.get("location"),
            message=doc["message"],
            status=FeedbackStatus(doc.get("status", FeedbackStatus.NEW)),
            created_at=doc["created_at"],
            updated_at=doc.get("updated_at", doc["created_at"]),
        )


class FeedbackDAL:
    def __init__(self, feedbacks: AsyncIOMotorCollection):
        self.__feedbacks = feedbacks

    async def ensure_indexes(self) -> None:
        await self.__feedbacks.create_index("user_id")
        await self.__feedbacks.create_index([("created_at", -1)])

    async def create_feedback(
        self,
        *,
        user_id: str | ObjectId,
        user_name: str,
        user_email: str,
        message: str,
        category: str | None = None,
        status: FeedbackStatus = FeedbackStatus.NEW,
        session=None,
    ) -> FeedbackData:
        now = datetime.now(timezone.utc)
        doc: Dict[str, Any] = {
            "user_id": _to_object_id(user_id),
            "user_name": user_name,
            "user_email": user_email,
            "message": message,
            "category": category,
            "status": status.value,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.__feedbacks.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return FeedbackData.from_doc(doc)

    async def list_feedback(self, *, session=None) -> List[FeedbackData]:
        cursor = self.__feedbacks.find({}, session=session).sort("created_at", -1)
        records: List[FeedbackData] = []
        async for doc in cursor:
            records.append(FeedbackData.from_doc(doc))
        return records

    async def list_feedback_for_user(
        self, user_id: str | ObjectId, *, session=None
    ) -> List[FeedbackData]:
        cursor = (
            self.__feedbacks.find({"user_id": _to_object_id(user_id)}, session=session)
            .sort("created_at", -1)
        )
        records: List[FeedbackData] = []
        async for doc in cursor:
            records.append(FeedbackData.from_doc(doc))
        return records

    async def update_status(
        self,
        feedback_id: str | ObjectId,
        status: FeedbackStatus,
        *,
        session=None,
    ) -> Optional[FeedbackData]:
        result = await self.__feedbacks.find_one_and_update(
            {"_id": _to_object_id(feedback_id)},
            {
                "$set": {
                    "status": status.value,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=True,
            session=session,
        )
        return FeedbackData.from_doc(result) if result else None

    async def delete_feedback(
        self, feedback_id: str | ObjectId, *, session=None
    ) -> bool:
        result = await self.__feedbacks.find_one_and_delete(
            {"_id": _to_object_id(feedback_id)}, session=session
        )
        return result is not None
