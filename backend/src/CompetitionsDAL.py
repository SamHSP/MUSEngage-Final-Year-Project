from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel


def _to_object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class CompetitionSubmissionData(BaseModel):
    id: str
    content: str
    submittedAt: datetime
    updatedAt: datetime | None = None
    participantId: str | None = None

    @staticmethod
    def from_doc(doc: Dict[str, Any], *, include_participant: bool = False) -> "CompetitionSubmissionData":
        participant_id = doc.get("participant_id")
        return CompetitionSubmissionData(
            id=doc["id"],
            content=doc["content"],
            submittedAt=doc["submitted_at"],
            updatedAt=doc.get("updated_at"),
            participantId=str(participant_id) if include_participant and participant_id else None,
        )


class CompetitionData(BaseModel):
    id: str
    title: str
    summary: str
    details: str
    imageUrl: str | None = None
    isActive: bool
    created_at: datetime
    updated_at: datetime
    submissionCount: int = 0
    userSubmission: CompetitionSubmissionData | None = None

    @staticmethod
    def from_doc(
        doc: Dict[str, Any],
        *,
        user_submission: CompetitionSubmissionData | None = None,
    ) -> "CompetitionData":
        submissions = doc.get("submissions", [])
        return CompetitionData(
            id=str(doc["_id"]),
            title=doc["title"],
            summary=doc.get("summary", ""),
            details=doc.get("details", ""),
            imageUrl=doc.get("imageUrl"),
            isActive=doc.get("is_active", True),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            submissionCount=len(submissions),
            userSubmission=user_submission,
        )


class CompetitionsDAL:
    def __init__(self, competitions: AsyncIOMotorCollection):
        self._competitions = competitions

    async def ensure_indexes(self) -> None:
        await self._competitions.create_index([("created_at", -1)])
        await self._competitions.create_index([("is_active", 1)])

    async def create_competition(
        self,
        *,
        title: str,
        summary: str,
        details: str,
        image_url: str | None = None,
        is_active: bool = True,
        session=None,
    ) -> CompetitionData:
        now = datetime.now(timezone.utc)
        doc = {
            "title": title,
            "summary": summary,
            "details": details,
            "imageUrl": image_url,
            "is_active": is_active,
            "created_at": now,
            "updated_at": now,
            "submissions": [],
        }
        result = await self._competitions.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return CompetitionData.from_doc(doc)

    async def list_competitions(
        self,
        *,
        participant_id: str | None = None,
        session=None,
    ) -> list[CompetitionData]:
        cursor = self._competitions.find({}, session=session).sort("created_at", -1)
        out: list[CompetitionData] = []
        async for doc in cursor:
            user_submission = None
            if participant_id:
                user_submission = self._find_submission_for_participant(doc, participant_id, include_participant=False)
            out.append(CompetitionData.from_doc(doc, user_submission=user_submission))
        return out

    async def get_competition(
        self,
        competition_id: str | ObjectId,
        *,
        participant_id: str | None = None,
        session=None,
    ) -> CompetitionData | None:
        doc = await self._competitions.find_one({"_id": _to_object_id(competition_id)}, session=session)
        if not doc:
            return None
        user_submission = None
        if participant_id:
            user_submission = self._find_submission_for_participant(doc, participant_id, include_participant=False)
        return CompetitionData.from_doc(doc, user_submission=user_submission)

    async def update_competition(
        self,
        competition_id: str | ObjectId,
        *,
        title: Optional[str] = None,
        summary: Optional[str] = None,
        details: Optional[str] = None,
        image_url: Optional[str] = None,
        is_active: Optional[bool] = None,
        session=None,
    ) -> CompetitionData | None:
        update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if title is not None:
            update["title"] = title
        if summary is not None:
            update["summary"] = summary
        if details is not None:
            update["details"] = details
        if image_url is not None:
            update["imageUrl"] = image_url
        if is_active is not None:
            update["is_active"] = is_active
        result = await self._competitions.find_one_and_update(
            {"_id": _to_object_id(competition_id)},
            {"$set": update},
            return_document=True,
            session=session,
        )
        if not result:
            return None
        return CompetitionData.from_doc(result)

    async def delete_competition(self, competition_id: str | ObjectId) -> bool:
        result = await self._competitions.delete_one({"_id": _to_object_id(competition_id)})
        return result.deleted_count == 1

    async def submit_entry(
        self,
        competition_id: str | ObjectId,
        *,
        participant_id: str,
        content: str,
        session=None,
    ) -> CompetitionSubmissionData | None:
        try:
            participant_object_id = _to_object_id(participant_id)
        except Exception:
            participant_object_id = participant_id
        doc = await self._competitions.find_one({"_id": _to_object_id(competition_id)}, session=session)
        if not doc:
            return None
        submissions: List[Dict[str, Any]] = list(doc.get("submissions", []))
        now = datetime.now(timezone.utc)
        updated_submission: Dict[str, Any]
        submission_index = None
        for index, submission in enumerate(submissions):
            if submission.get("participant_id") == participant_object_id:
                submission_index = index
                break
        if submission_index is not None:
            submissions[submission_index]["content"] = content
            submissions[submission_index]["updated_at"] = now
            updated_submission = submissions[submission_index]
        else:
            updated_submission = {
                "id": uuid4().hex,
                "participant_id": participant_object_id,
                "content": content,
                "submitted_at": now,
                "updated_at": now,
            }
            submissions.append(updated_submission)
        await self._competitions.update_one(
            {"_id": _to_object_id(competition_id)},
            {
                "$set": {
                    "submissions": submissions,
                    "updated_at": now,
                }
            },
            session=session,
        )
        doc["submissions"] = submissions
        doc["updated_at"] = now
        return CompetitionSubmissionData.from_doc(updated_submission, include_participant=False)

    async def list_submissions(
        self,
        competition_id: str | ObjectId,
        *,
        include_participant: bool = True,
        session=None,
    ) -> list[CompetitionSubmissionData]:
        doc = await self._competitions.find_one({"_id": _to_object_id(competition_id)}, session=session)
        if not doc:
            return []
        submissions: list[Dict[str, Any]] = doc.get("submissions", [])
        records = [
            CompetitionSubmissionData.from_doc(submission, include_participant=include_participant)
            for submission in submissions
        ]
        return sorted(
            records,
            key=lambda entry: entry.updatedAt or entry.submittedAt,
            reverse=True,
        )

    async def get_submission_for_participant(
        self,
        competition_id: str | ObjectId,
        participant_id: str,
        *,
        session=None,
    ) -> CompetitionSubmissionData | None:
        doc = await self._competitions.find_one({"_id": _to_object_id(competition_id)}, session=session)
        if not doc:
            return None
        submission = self._find_submission_for_participant(doc, participant_id, include_participant=False)
        return submission

    def _find_submission_for_participant(
        self,
        doc: Dict[str, Any],
        participant_id: str,
        *,
        include_participant: bool,
    ) -> CompetitionSubmissionData | None:
        try:
            participant_object_id = _to_object_id(participant_id)
        except Exception:
            participant_object_id = participant_id
        for submission in doc.get("submissions", []):
            if submission.get("participant_id") == participant_object_id:
                return CompetitionSubmissionData.from_doc(submission, include_participant=include_participant)
        return None

