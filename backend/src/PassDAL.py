from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, ConfigDict


class PassSessionData(BaseModel):
    id: str
    meetingTime: str
    studentLecturer: str
    venue: str
    meetLink: str

    model_config = ConfigDict(populate_by_name=True)

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "PassSessionData":
        return PassSessionData(
            id=str(doc["_id"]),
            meetingTime=doc.get("meeting_time", ""),
            studentLecturer=doc.get("student_lecturer", ""),
            venue=doc.get("venue", ""),
            meetLink=doc.get("meet_link", ""),
        )


class PassDAL:
    def __init__(self, collection: AsyncIOMotorCollection):
        self._collection = collection

    async def ensure_indexes(self) -> None:
        await self._collection.create_index(
            [("fingerprint", 1)],
            unique=True,
            name="pass_session_fingerprint_unique",
        )
        await self._collection.create_index(
            [("meeting_time", 1), ("student_lecturer", 1)],
            name="pass_session_meeting_student",
        )

    async def list_sessions(self, *, session=None) -> List[PassSessionData]:
        cursor = self._collection.find({}, session=session).sort("meeting_time", 1)
        sessions: List[PassSessionData] = []
        async for doc in cursor:
            sessions.append(PassSessionData.from_doc(doc))
        return sessions

    async def import_sessions(
        self,
        sessions: Iterable[Dict[str, str]],
        *,
        session=None,
    ) -> Tuple[List[PassSessionData], int]:
        added: List[PassSessionData] = []
        duplicates = 0
        now = datetime.now(timezone.utc)

        for session_doc in self._iter_session_docs(sessions, now):
            try:
                result = await self._collection.insert_one(session_doc, session=session)
            except DuplicateKeyError:
                duplicates += 1
                continue

            session_doc["_id"] = result.inserted_id
            added.append(PassSessionData.from_doc(session_doc))

        return added, duplicates

    async def clear_sessions(self, *, session=None) -> int:
        result = await self._collection.delete_many({}, session=session)
        return result.deleted_count

    def _iter_session_docs(
        self,
        sessions: Iterable[Dict[str, str]],
        now: datetime,
    ):
        for session in sessions:
            meeting_time = session.get("meeting_time", "").strip()
            student_lecturer = session.get("student_lecturer", "").strip()
            venue = session.get("venue", "").strip()
            meet_link = session.get("meet_link", "").strip()

            if not meeting_time or not student_lecturer or not venue or not meet_link:
                continue

            yield {
                "meeting_time": meeting_time,
                "student_lecturer": student_lecturer,
                "venue": venue,
                "meet_link": meet_link,
                "fingerprint": self._create_fingerprint(
                    meeting_time,
                    student_lecturer,
                    venue,
                    meet_link,
                ),
                "created_at": now,
            }

    @staticmethod
    def _create_fingerprint(
        meeting_time: str,
        student_lecturer: str,
        venue: str,
        meet_link: str,
    ) -> str:
        return "|".join(
            value.strip().lower()
            for value in (meeting_time, student_lecturer, venue, meet_link)
        )
