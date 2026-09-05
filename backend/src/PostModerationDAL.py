from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import ReturnDocument

from model import PostModerationRecord, PostModerationStatus, PostSubmissionStatus, UserDataOut


class PostModerationDAL:
    """Data access layer for AI-rejected community posts awaiting admin review."""

    def __init__(self, collection: AsyncIOMotorCollection):
        self._collection = collection

    async def create_rejected_submission(
        self,
        *,
        author: UserDataOut,
        title: str,
        content: str,
        flair: str | None,
        image_url: str | None,
        reason: str,
        categories: list[str] | None = None,
        status: PostSubmissionStatus = PostSubmissionStatus.REJECTED,
        session: Any = None,
    ) -> PostModerationRecord:
        submitted_at = datetime.now(timezone.utc)
        cleaned_categories = [
            str(item).strip()
            for item in (categories or [])
            if isinstance(item, (str, bytes)) and str(item).strip()
        ]
        doc: dict[str, Any] = {
            "author_id": ObjectId(author.id),
            "author_name": author.name,
            "author_email": author.email,
            "title": title,
            "content": content,
            "flair": flair,
            "image_url": image_url,
            "submitted_at": submitted_at,
            "reason": reason,
            "categories": cleaned_categories,
            "status": PostModerationStatus.PENDING_REVIEW.value,
            "ai_status": status.value,
        }
        result = await self._collection.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return PostModerationRecord.from_doc(doc)

    async def list_pending(self) -> list[PostModerationRecord]:
        cursor = self._collection.find({"status": PostModerationStatus.PENDING_REVIEW.value}).sort("submitted_at", -1)
        records: list[PostModerationRecord] = []
        async for doc in cursor:
            records.append(PostModerationRecord.from_doc(doc))
        return records

    async def get_record(self, record_id: str) -> PostModerationRecord | None:
        try:
            object_id = ObjectId(record_id)
        except Exception:
            return None
        doc = await self._collection.find_one({"_id": object_id})
        if not doc:
            return None
        return PostModerationRecord.from_doc(doc)

    async def mark_approved(
        self,
        record_id: str,
        *,
        admin_id: str,
        admin_name: str,
        post_id: str,
        note: str | None = None,
        session: Any = None,
    ) -> PostModerationRecord | None:
        try:
            object_id = ObjectId(record_id)
        except Exception:
            return None
        update = {
            "$set": {
                "status": PostModerationStatus.APPROVED.value,
                "decided_at": datetime.now(timezone.utc),
                "decided_by": ObjectId(admin_id),
                "decided_by_name": admin_name,
                "admin_note": note,
                "post_id": ObjectId(post_id),
            }
        }
        doc = await self._collection.find_one_and_update(
            {"_id": object_id, "status": PostModerationStatus.PENDING_REVIEW.value},
            update,
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            return None
        return PostModerationRecord.from_doc(doc)

    async def mark_rejected(
        self,
        record_id: str,
        *,
        admin_id: str,
        admin_name: str,
        note: str | None = None,
        session: Any = None,
    ) -> PostModerationRecord | None:
        try:
            object_id = ObjectId(record_id)
        except Exception:
            return None
        update = {
            "$set": {
                "status": PostModerationStatus.REJECTED.value,
                "decided_at": datetime.now(timezone.utc),
                "decided_by": ObjectId(admin_id),
                "decided_by_name": admin_name,
                "admin_note": note,
            }
        }
        doc = await self._collection.find_one_and_update(
            {"_id": object_id, "status": PostModerationStatus.PENDING_REVIEW.value},
            update,
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            return None
        return PostModerationRecord.from_doc(doc)

    async def delete_record(self, record_id: str, *, session: Any = None) -> bool:
        try:
            object_id = ObjectId(record_id)
        except Exception:
            return False
        result = await self._collection.delete_one({"_id": object_id}, session=session)
        return result.deleted_count == 1
