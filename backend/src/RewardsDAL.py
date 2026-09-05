from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field, ConfigDict


def _to_object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class RewardData(BaseModel):
    id: str
    name: str
    description: str = Field(default="")
    pointsCost: int = Field(ge=0)
    stock: int = Field(default=0, ge=0)
    imageUrl: str | None = None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "RewardData":
        return RewardData(
            id=str(doc["_id"]),
            name=doc["name"],
            description=doc.get("description", ""),
            pointsCost=doc.get("pointsCost", 0),
            stock=int(doc.get("stock", 0) or 0),
            imageUrl=doc.get("imageUrl"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )


class RewardRedemptionStatus(str, Enum):
    UNCLAIMED = "unclaimed"
    CLAIMED = "claimed"


class RewardRedemptionData(BaseModel):
    id: str
    rewardId: str
    rewardName: str
    rewardImageUrl: str | None = None
    pointsCost: int = Field(ge=0)
    userId: str
    userName: str
    token: str
    status: RewardRedemptionStatus
    createdAt: datetime
    claimedAt: datetime | None = None

    model_config = ConfigDict(populate_by_name=True)

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "RewardRedemptionData":
        status_value = doc.get("status", RewardRedemptionStatus.UNCLAIMED.value)
        try:
            status = RewardRedemptionStatus(status_value)
        except ValueError:
            status = RewardRedemptionStatus.UNCLAIMED

        return RewardRedemptionData(
            id=str(doc["_id"]),
            rewardId=str(doc.get("reward_id")),
            rewardName=doc.get("reward_name", ""),
            rewardImageUrl=doc.get("reward_image_url"),
            pointsCost=int(doc.get("points_cost", 0) or 0),
            userId=str(doc.get("user_id")),
            userName=doc.get("user_name", ""),
            token=doc.get("token", ""),
            status=status,
            createdAt=doc.get("created_at"),
            claimedAt=doc.get("claimed_at"),
        )


class RewardsDAL:
    def __init__(self, rewards: AsyncIOMotorCollection, redemptions: AsyncIOMotorCollection | None = None):
        self._rewards = rewards
        self._redemptions = redemptions

    async def ensure_indexes(self) -> None:
        await self._rewards.create_index([("created_at", -1)])
        await self._rewards.create_index([("name", 1)], name="reward_name")
        if self._redemptions is not None:
            await self._redemptions.create_index([("token", 1)], unique=True, name="reward_redemption_token")
            await self._redemptions.create_index(
                [("user_id", 1), ("created_at", -1)],
                name="reward_redemptions_user_created",
            )

    async def create_reward(
        self,
        *,
        name: str,
        description: str,
        points_cost: int,
        stock: int,
        image_url: str | None = None,
        session=None,
    ) -> RewardData:
        now = datetime.now(timezone.utc)
        doc = {
            "name": name,
            "description": description,
            "pointsCost": points_cost,
            "stock": stock,
            "imageUrl": image_url,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._rewards.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return RewardData.from_doc(doc)

    async def list_rewards(self, *, session=None) -> list[RewardData]:
        cursor = self._rewards.find({}, session=session).sort("created_at", -1)
        out: list[RewardData] = []
        async for doc in cursor:
            out.append(RewardData.from_doc(doc))
        return out

    async def get_reward(self, reward_id: str | ObjectId, *, session=None) -> RewardData | None:
        doc = await self._rewards.find_one({"_id": _to_object_id(reward_id)}, session=session)
        return RewardData.from_doc(doc) if doc else None

    async def update_reward(
        self,
        reward_id: str | ObjectId,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        points_cost: Optional[int] = None,
        stock: Optional[int] = None,
        image_url: Optional[str] = None,
        session=None,
    ) -> RewardData | None:
        update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if name is not None:
            update["name"] = name
        if description is not None:
            update["description"] = description
        if points_cost is not None:
            update["pointsCost"] = points_cost
        if stock is not None:
            update["stock"] = stock
        if image_url is not None:
            update["imageUrl"] = image_url

        result = await self._rewards.find_one_and_update(
            {"_id": _to_object_id(reward_id)},
            {"$set": update},
            return_document=True,
            session=session,
        )
        return RewardData.from_doc(result) if result else None

    async def delete_reward(self, reward_id: str | ObjectId) -> bool:
        result = await self._rewards.delete_one({"_id": _to_object_id(reward_id)})
        return result.deleted_count == 1

    async def adjust_stock(
        self,
        reward_id: str | ObjectId,
        delta: int,
        *,
        session=None,
    ) -> RewardData | None:
        if delta == 0:
            return await self.get_reward(reward_id, session=session)

        query: Dict[str, Any] = {"_id": _to_object_id(reward_id)}
        if delta < 0:
            query["stock"] = {"$gte": abs(delta)}

        result = await self._rewards.find_one_and_update(
            query,
            {
                "$inc": {"stock": delta},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
            return_document=True,
            session=session,
        )
        return RewardData.from_doc(result) if result else None

    def _ensure_redemptions(self) -> AsyncIOMotorCollection:
        if self._redemptions is None:
            raise RuntimeError("Reward redemptions collection is not configured")
        return self._redemptions

    async def create_redemption(
        self,
        *,
        reward: RewardData,
        user_id: str | ObjectId,
        user_name: str,
        token: str,
        session=None,
    ) -> RewardRedemptionData:
        redemptions = self._ensure_redemptions()
        now = datetime.now(timezone.utc)
        doc = {
            "reward_id": _to_object_id(reward.id),
            "reward_name": reward.name,
            "reward_image_url": reward.imageUrl,
            "points_cost": reward.pointsCost,
            "user_id": _to_object_id(user_id),
            "user_name": user_name,
            "token": token,
            "status": RewardRedemptionStatus.UNCLAIMED.value,
            "created_at": now,
            "claimed_at": None,
        }
        result = await redemptions.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return RewardRedemptionData.from_doc(doc)

    async def list_redemptions_for_user(
        self,
        user_id: str | ObjectId,
        *,
        session=None,
    ) -> list[RewardRedemptionData]:
        redemptions = self._ensure_redemptions()
        cursor = (
            redemptions.find({"user_id": _to_object_id(user_id)}, session=session)
            .sort("created_at", -1)
        )
        out: list[RewardRedemptionData] = []
        async for doc in cursor:
            out.append(RewardRedemptionData.from_doc(doc))
        return out

    async def list_redemptions(
        self,
        *,
        session=None,
    ) -> list[RewardRedemptionData]:
        redemptions = self._ensure_redemptions()
        cursor = redemptions.find({}, session=session).sort("created_at", -1)
        out: list[RewardRedemptionData] = []
        async for doc in cursor:
            out.append(RewardRedemptionData.from_doc(doc))
        return out

    async def get_redemption(
        self,
        redemption_id: str | ObjectId,
        *,
        session=None,
    ) -> RewardRedemptionData | None:
        redemptions = self._ensure_redemptions()
        doc = await redemptions.find_one({"_id": _to_object_id(redemption_id)}, session=session)
        return RewardRedemptionData.from_doc(doc) if doc else None

    async def get_redemption_by_token(
        self,
        token: str,
        *,
        session=None,
    ) -> RewardRedemptionData | None:
        redemptions = self._ensure_redemptions()
        doc = await redemptions.find_one({"token": token}, session=session)
        return RewardRedemptionData.from_doc(doc) if doc else None

    async def mark_redemption_claimed_by_token(
        self,
        token: str,
        *,
        session=None,
    ) -> tuple[RewardRedemptionData, bool] | None:
        redemptions = self._ensure_redemptions()
        updated = await redemptions.find_one_and_update(
            {
                "token": token,
                "status": RewardRedemptionStatus.UNCLAIMED.value,
            },
            {
                "$set": {
                    "status": RewardRedemptionStatus.CLAIMED.value,
                    "claimed_at": datetime.now(timezone.utc),
                }
            },
            return_document=True,
            session=session,
        )
        if updated:
            return RewardRedemptionData.from_doc(updated), True

        existing = await redemptions.find_one({"token": token}, session=session)
        if not existing:
            return None
        return RewardRedemptionData.from_doc(existing), False

