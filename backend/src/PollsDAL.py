from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel


def _to_object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class PollOptionResult(BaseModel):
    option: str
    votes: int


class PollData(BaseModel):
    id: str
    question: str
    options: list[str]
    imageUrl: str | None = None
    isFinalized: bool
    rewardPoints: int = 0
    rewardPointsAwarded: bool = False
    created_at: datetime
    updated_at: datetime
    finalized_at: datetime | None = None
    totalVotes: int
    results: list[PollOptionResult] | None = None
    userVote: int | None = None

    @staticmethod
    def from_doc(
        doc: Dict[str, Any],
        *,
        include_results: bool = False,
        user_vote: int | None = None,
    ) -> "PollData":
        votes: list[int] = doc.get("votes", [0] * len(doc.get("options", [])))
        results: list[PollOptionResult] | None = None
        if include_results:
            results = [
                PollOptionResult(option=option, votes=votes[index] if index < len(votes) else 0)
                for index, option in enumerate(doc.get("options", []))
            ]
        return PollData(
            id=str(doc["_id"]),
            question=doc["question"],
            options=list(doc.get("options", [])),
            imageUrl=doc.get("imageUrl"),
            isFinalized=doc.get("is_finalized", False),
            rewardPoints=int(doc.get("reward_points", 0) or 0),
            rewardPointsAwarded=bool(doc.get("reward_points_awarded", False)),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            finalized_at=doc.get("finalized_at"),
            totalVotes=sum(votes),
            results=results,
            userVote=user_vote,
        )


class PollsDAL:
    def __init__(self, polls: AsyncIOMotorCollection):
        self._polls = polls

    async def ensure_indexes(self) -> None:
        await self._polls.create_index([("created_at", -1)])

    async def create_poll(
        self,
        *,
        question: str,
        options: list[str],
        image_url: str | None = None,
        reward_points: int = 0,
        session=None,
    ) -> PollData:
        now = datetime.now(timezone.utc)
        doc = {
            "question": question,
            "options": options,
            "imageUrl": image_url,
            "votes": [0] * len(options),
            "voter_map": {},
            "is_finalized": False,
            "reward_points": max(0, int(reward_points)),
            "reward_points_awarded": False,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._polls.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return PollData.from_doc(doc, include_results=False)

    async def list_polls(
        self,
        *,
        include_results: bool = False,
        participant_id: str | None = None,
        session=None,
    ) -> list[PollData]:
        cursor = self._polls.find({}, session=session).sort("created_at", -1)
        out: list[PollData] = []
        async for doc in cursor:
            user_vote: int | None = None
            if participant_id:
                voter_map: Dict[str, int] = doc.get("voter_map", {})
                user_vote = voter_map.get(participant_id)
            include = include_results or doc.get("is_finalized", False)
            out.append(PollData.from_doc(doc, include_results=include, user_vote=user_vote))
        return out

    async def get_poll(
        self,
        poll_id: str | ObjectId,
        *,
        include_results: bool = False,
        participant_id: str | None = None,
        session=None,
    ) -> PollData | None:
        doc = await self._polls.find_one({"_id": _to_object_id(poll_id)}, session=session)
        if not doc:
            return None
        include = include_results or doc.get("is_finalized", False)
        user_vote: int | None = None
        if participant_id:
            voter_map: Dict[str, int] = doc.get("voter_map", {})
            user_vote = voter_map.get(participant_id)
        return PollData.from_doc(doc, include_results=include, user_vote=user_vote)

    async def delete_poll(self, poll_id: str | ObjectId) -> bool:
        result = await self._polls.delete_one({"_id": _to_object_id(poll_id)})
        return result.deleted_count == 1

    async def finalize_poll(self, poll_id: str | ObjectId, *, session=None) -> PollData | None:
        now = datetime.now(timezone.utc)
        result = await self._polls.find_one_and_update(
            {"_id": _to_object_id(poll_id), "is_finalized": False},
            {"$set": {"is_finalized": True, "finalized_at": now, "updated_at": now}},
            return_document=True,
            session=session,
        )
        if not result:
            return None
        return PollData.from_doc(result, include_results=True)

    async def update_poll(
        self,
        poll_id: str | ObjectId,
        *,
        question: Optional[str] = None,
        options: Optional[list[str]] = None,
        image_url: Optional[str] = None,
        reward_points: Optional[int] = None,
        session=None,
    ) -> PollData | None:
        update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        reset_votes = False
        if question is not None:
            update["question"] = question
        if options is not None:
            update["options"] = options
            update["votes"] = [0] * len(options)
            update["voter_map"] = {}
            reset_votes = True
        if image_url is not None:
            update["imageUrl"] = image_url
        if reward_points is not None:
            update["reward_points"] = max(0, int(reward_points))
        result = await self._polls.find_one_and_update(
            {"_id": _to_object_id(poll_id), "is_finalized": False},
            {"$set": update},
            return_document=True,
            session=session,
        )
        if not result:
            return None
        include_results = result.get("is_finalized", False) and not reset_votes
        return PollData.from_doc(result, include_results=include_results)

    async def cast_vote(
        self,
        poll_id: str | ObjectId,
        *,
        participant_id: str,
        option_index: int,
        session=None,
    ) -> PollData | None:
        doc = await self._polls.find_one({"_id": _to_object_id(poll_id)}, session=session)
        if not doc or doc.get("is_finalized", False):
            return None
        options: list[str] = doc.get("options", [])
        if option_index < 0 or option_index >= len(options):
            raise ValueError("Invalid option index")
        votes: list[int] = list(doc.get("votes", [0] * len(options)))
        voter_map: Dict[str, int] = dict(doc.get("voter_map", {}))
        previous_choice = voter_map.get(participant_id)
        if previous_choice is not None:
            if previous_choice == option_index:
                return PollData.from_doc(doc, include_results=False, user_vote=option_index)
            votes[previous_choice] = max(0, votes[previous_choice] - 1)
        votes[option_index] = votes[option_index] + 1
        voter_map[participant_id] = option_index
        now = datetime.now(timezone.utc)
        update: Dict[str, Any] = {
            "votes": votes,
            "voter_map": voter_map,
            "updated_at": now,
        }
        await self._polls.update_one(
            {"_id": _to_object_id(poll_id)},
            {"$set": update},
            session=session,
        )
        doc.update(update)
        return PollData.from_doc(doc, include_results=False, user_vote=option_index)

    async def get_poll_participant_ids(self, poll_id: str | ObjectId, *, session=None) -> list[str]:
        doc = await self._polls.find_one(
            {"_id": _to_object_id(poll_id)},
            projection={"voter_map": 1},
            session=session,
        )
        if not doc:
            return []
        voter_map: Dict[str, Any] = doc.get("voter_map", {}) or {}
        return [str(user_id) for user_id in voter_map.keys()]

    async def mark_reward_points_awarded(
        self, poll_id: str | ObjectId, *, session=None
    ) -> bool:
        result = await self._polls.update_one(
            {"_id": _to_object_id(poll_id)},
            {"$set": {"reward_points_awarded": True, "updated_at": datetime.now(timezone.utc)}},
            session=session,
        )
        return result.modified_count > 0

