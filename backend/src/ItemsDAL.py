from __future__ import annotations
from bson import ObjectId
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field
from datetime import datetime, timezone

def _to_object_id(val: str | ObjectId) -> ObjectId:
    return val if isinstance(val, ObjectId) else ObjectId(val)

class ItemData(BaseModel):
    id: str
    name: str
    description: str
    availabilityCount: int = Field(ge=0)
    price: int = Field(ge=0, description="Price in cents (e.g., 500 = $5.00)")
    url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "ItemData":
        return ItemData(
            id=str(doc["_id"]),
            name=doc["name"],
            description=doc.get("description", ""),
            availabilityCount=doc.get("availabilityCount", 0),
            price=doc.get("price", 0),
            url=doc.get("url"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

class ItemsDAL:
    def __init__(self, items: AsyncIOMotorCollection):
        self._items = items

    async def ensure_indexes(self):
        await self._items.create_index([("created_at", -1)])
        await self._items.create_index([("name", 1)], name="name_asc")

    async def create_item(
        self,
        *,
        name: str,
        description: str,
        availabilityCount: int,
        price: int,
        url: Optional[str] = None,
        session=None,
    ) -> ItemData:
        now = datetime.now(timezone.utc)
        doc = {
            "name": name,
            "description": description,
            "availabilityCount": availabilityCount,
            "price": price,
            "url": url,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._items.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return ItemData.from_doc(doc)

    async def list_items(self, *, session=None) -> List[ItemData]:
        cursor = self._items.find({}, session=session).sort("created_at", -1)
        out: List[ItemData] = []
        async for doc in cursor:
            out.append(ItemData.from_doc(doc))
        return out

    async def get_item(self, item_id: str | ObjectId, *, session=None) -> Optional[ItemData]:
        doc = await self._items.find_one({"_id": _to_object_id(item_id)}, session=session)
        return ItemData.from_doc(doc) if doc else None

    async def update_item(
        self,
        item_id: str | ObjectId,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        availabilityCount: Optional[int] = None,
        price: Optional[int] = None,
        url: Optional[str] = None,
        session=None,
    ) -> Optional[ItemData]:
        update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if name is not None:
            update["name"] = name
        if description is not None:
            update["description"] = description
        if availabilityCount is not None:
            update["availabilityCount"] = availabilityCount
        if price is not None:
            update["price"] = price
        if url is not None:
            update["url"] = url

        result = await self._items.find_one_and_update(
            {"_id": _to_object_id(item_id)},
            {"$set": update},
            return_document=True,
            session=session,
        )
        return ItemData.from_doc(result) if result else None

    async def delete_item(self, item_id: str | ObjectId) -> bool:
        res = await self._items.delete_one({"_id": _to_object_id(item_id)})
        return res.deleted_count == 1

    async def adjust_stock(self, item_id: str | ObjectId, delta: int, *, session=None) -> Optional[ItemData]:
        # prevent negative inventory
        result = await self._items.find_one_and_update(
            {"_id": _to_object_id(item_id), "availabilityCount": {"$gte": max(0, -delta)}},
            {"$inc": {"availabilityCount": delta}, "$set": {"updated_at": datetime.now(timezone.utc)}},
            return_document=True,
            session=session,
        )
        return ItemData.from_doc(result) if result else None

