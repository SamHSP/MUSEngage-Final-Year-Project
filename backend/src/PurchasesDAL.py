from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Sequence

from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field
from bson import ObjectId


def _ensure_object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class PurchaseItemData(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: int = Field(ge=0)
    quantity: int = Field(ge=1)

    @staticmethod
    def from_doc(doc: dict[str, Any]) -> "PurchaseItemData":
        return PurchaseItemData(
            name=str(doc.get("name", "")).strip() or "Unnamed item",
            price=int(doc.get("price", 0)),
            quantity=max(1, int(doc.get("quantity", 1))),
        )


class PurchaseRecordData(BaseModel):
    id: str
    userId: str | None
    userEmail: str
    shippingAddress: str
    totalAmount: int
    status: str
    checkoutSessionId: str | None = None
    createdAt: datetime
    items: list[PurchaseItemData]

    @staticmethod
    def from_doc(doc: dict[str, Any]) -> "PurchaseRecordData":
        user_id = doc.get("user_id")
        return PurchaseRecordData(
            id=str(doc["_id"]),
            userId=str(user_id) if user_id else None,
            userEmail=str(doc.get("user_email", "")),
            shippingAddress=str(doc.get("shipping_address", "")),
            totalAmount=int(doc.get("total_amount", 0)),
            status=str(doc.get("status", "created")),
            checkoutSessionId=doc.get("checkout_session_id"),
            createdAt=doc.get("created_at", datetime.now(timezone.utc)),
            items=[PurchaseItemData.from_doc(item) for item in doc.get("items", [])],
        )


class PurchasesDAL:
    def __init__(self, collection: AsyncIOMotorCollection):
        self._collection = collection

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("user_id", 1), ("created_at", -1)], name="user_created_at")
        await self._collection.create_index([("created_at", -1)], name="created_at_desc")

    async def create_purchase(
        self,
        *,
        user_id: str | ObjectId | None,
        user_email: str,
        shipping_address: str,
        items: Sequence[dict[str, Any]],
        total_amount: int,
        status: str = "created",
        checkout_session_id: str | None = None,
        session=None,
    ) -> PurchaseRecordData:
        now = datetime.now(timezone.utc)
        clean_items: list[dict[str, Any]] = []
        for item in items:
            try:
                name = str(item.get("name", "")).strip() or "Unnamed item"
            except Exception:
                name = "Unnamed item"
            price = int(item.get("price", 0))
            quantity = max(1, int(item.get("quantity", 1)))
            clean_items.append({
                "name": name,
                "price": max(price, 0),
                "quantity": quantity,
            })
        doc: dict[str, Any] = {
            "user_email": user_email,
            "shipping_address": shipping_address,
            "items": clean_items,
            "total_amount": max(total_amount, 0),
            "status": status,
            "checkout_session_id": checkout_session_id,
            "created_at": now,
        }
        if user_id:
            doc["user_id"] = _ensure_object_id(user_id)
        result = await self._collection.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return PurchaseRecordData.from_doc(doc)

    async def list_purchases_for_user(
        self,
        user_id: str | ObjectId,
        *,
        session=None,
    ) -> List[PurchaseRecordData]:
        if not user_id:
            return []

        try:
            lookup_id = _ensure_object_id(user_id)
        except Exception:
            return []

        cursor = (
            self._collection
            .find({"user_id": lookup_id}, session=session)
            .sort("created_at", -1)
        )
        records: List[PurchaseRecordData] = []
        async for doc in cursor:
            records.append(PurchaseRecordData.from_doc(doc))
        return records
