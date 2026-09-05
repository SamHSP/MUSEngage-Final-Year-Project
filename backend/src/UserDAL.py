from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Literal, Sequence

import bcrypt
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import ReturnDocument

from model import UserDataIn, UserDataOut


logger = logging.getLogger("musengage.security.auth")

BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "14"))
BCRYPT_ROUNDS_MIN = 12
BCRYPT_ROUNDS_MAX = 16

if not (BCRYPT_ROUNDS_MIN <= BCRYPT_ROUNDS <= BCRYPT_ROUNDS_MAX):
    logger.warning(
        "BCRYPT_ROUNDS (%s) is outside recommended range [%s, %s]",
        BCRYPT_ROUNDS,
        BCRYPT_ROUNDS_MIN,
        BCRYPT_ROUNDS_MAX,
    )

COMMON_PASSWORDS = {
    "password123",
    "password123!",
    "Password123",
    "Password123!",
    "Passw0rd!",
    "P@ssw0rd",
    "P@ssword123",
    "Admin123!",
    "Welcome123",
    "Welcome123!",
    "Qwerty123",
    "Qwerty123!",
}


def validate_password(password: str) -> tuple[bool, str | None]:
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit"
    if not re.search(r"[!@#$%^&*()_+\-=[\]{}|;:,.<>?]", password):
        return False, "Password must contain at least one special character (!@#$%^&* etc.)"
    if password in COMMON_PASSWORDS or password.lower() in COMMON_PASSWORDS:
        return False, "This password is too common. Please choose a stronger password"
    return True, None


class UserDAL:
    def __init__(self, users: AsyncIOMotorCollection):
        self.__users = users

    async def validate_credentials(self, email: str, password: str, session=None) -> bool:
        doc = await self.__users.find_one(
            {"email": email.strip()},
            projection={"password": 1, "_id": 1},
            session=session,
        )
        if not doc:
            return False

        doc_hash = doc["password"]
        start_time = time.time()
        is_valid = bcrypt.checkpw(password.encode("utf-8"), doc_hash)
        elapsed = time.time() - start_time
        if elapsed > 0.5:
            logger.warning("Password verification took %.2fs", elapsed)

        if not is_valid:
            return False

        await self._rehash_password_if_needed(doc, password, session=session)
        return True

    async def _rehash_password_if_needed(self, doc: dict[str, Any], password: str, *, session=None) -> None:
        try:
            hash_parts = doc["password"].split(b"$")
            desired_cost = f"{BCRYPT_ROUNDS:02d}".encode()
            if len(hash_parts) < 3 or hash_parts[2] == desired_cost:
                return
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("Unable to inspect bcrypt hash: %s", exc)
            return

        start_time = time.time()
        new_salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        new_hash = bcrypt.hashpw(password.encode("utf-8"), new_salt)
        elapsed = time.time() - start_time
        if elapsed > 0.5:
            logger.warning("Password rehashing took %.2fs", elapsed)

        await self.__users.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "password": new_hash,
                    "password_updated_at": datetime.now(timezone.utc),
                }
            },
            session=session,
        )

    async def validate_user(self, email: str, session=None) -> bool:
        result = await self.__users.find_one({"email": email.strip()}, session=session)
        return result is not None

    async def update_user(
        self,
        user_id: str,
        *,
        new_name: str | None = None,
        new_role: str | None = None,
        new_reward_points: int | None = None,
        new_profile_image_url: str | None | Literal[False] = None,
        email_verified: bool | None = None,
        session=None,
    ) -> UserDataOut | None:
        update_fields: dict[str, Any] = {}
        if new_name is not None:
            update_fields["name"] = new_name
        if new_role is not None:
            update_fields["role"] = new_role
        if new_reward_points is not None:
            update_fields["rewardPoints"] = new_reward_points
        if new_profile_image_url is not None or new_profile_image_url is False:
            update_fields["profileImageUrl"] = None if new_profile_image_url is False else new_profile_image_url
        if email_verified is not None:
            update_fields["email_verified"] = email_verified

        if not update_fields:
            doc = await self.__users.find_one({"_id": ObjectId(user_id)}, session=session)
            return UserDataOut.from_doc(doc) if doc else None

        result = await self.__users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields},
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if result:
            return UserDataOut.from_doc(result)
        return None

    async def adjust_reward_points(
        self,
        user_id: str,
        delta: int,
        *,
        session=None,
    ) -> UserDataOut | None:
        query: dict[str, Any] = {"_id": ObjectId(user_id)}
        if delta < 0:
            query["rewardPoints"] = {"$gte": abs(delta)}

        result = await self.__users.find_one_and_update(
            query,
            {"$inc": {"rewardPoints": delta}},
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        return UserDataOut.from_doc(result) if result else None

    async def delete_user(self, user_id: str) -> bool:
        result = await self.__users.delete_one({"_id": ObjectId(user_id)})
        return result.deleted_count == 1

    async def list_users(self):
        cursor = self.__users.find({})
        users = []
        async for doc in cursor:
            doc.pop("password", None)
            users.append(UserDataOut.from_doc(doc))
        return users

    async def list_users_with_roles(self, roles: Sequence[str], session=None) -> list[UserDataOut]:
        role_values = [role for role in roles if isinstance(role, str) and role.strip()]
        if not role_values:
            return []
        cursor = self.__users.find({"role": {"$in": role_values}}, session=session)
        users: list[UserDataOut] = []
        async for doc in cursor:
            doc.pop("password", None)
            users.append(UserDataOut.from_doc(doc))
        return users

    async def list_users_excluding_roles(self, roles: Sequence[str], session=None) -> list[UserDataOut]:
        role_values = [role for role in roles if isinstance(role, str) and role.strip()]
        query = {"role": {"$nin": role_values}} if role_values else {}
        cursor = self.__users.find(query, session=session)
        users: list[UserDataOut] = []
        async for doc in cursor:
            doc.pop("password", None)
            users.append(UserDataOut.from_doc(doc))
        return users

    async def create_user(
        self,
        email: str,
        name: str,
        password: str,
        *,
        session=None,
        role: str = "student",
        email_verified: bool = False,
        verification_token: str | None = None,
        verification_token_expires: datetime | None = None,
    ) -> UserDataIn | None:
        is_valid, error_msg = validate_password(password)
        if not is_valid:
            raise ValueError(error_msg or "Invalid password")

        start_time = time.time()
        salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        hash_pass = bcrypt.hashpw(password.encode("utf-8"), salt)
        elapsed = time.time() - start_time
        if elapsed > 0.5:
            logger.warning("Password hashing took %.2fs (work factor: %s)", elapsed, BCRYPT_ROUNDS)

        now = datetime.now(timezone.utc)
        doc = {
            "email": email,
            "name": name,
            "password": hash_pass,
            "role": role,
            "rewardPoints": 0,
            "likedEvents": [],
            "profileImageUrl": None,
            "email_verified": email_verified,
            "verification_token": verification_token,
            "verification_token_expires": verification_token_expires,
            "password_updated_at": now,
        }
        result = await self.__users.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return UserDataIn.from_doc(doc)

    async def get_user(self, id: str | ObjectId, session=None) -> UserDataOut | None:
        try:
            object_id = ObjectId(id)
        except Exception:
            return None
        doc = await self.__users.find_one({"_id": object_id}, session=session)
        if not doc:
            return None
        return UserDataOut.from_doc(doc)

    async def get_user_by_email(self, email: str, session=None) -> UserDataOut | None:
        doc = await self.__users.find_one({"email": email.strip()}, session=session)
        if not doc:
            return None
        return UserDataOut.from_doc(doc)

    async def get_user_by_verification_token(self, token: str, session=None) -> UserDataOut | None:
        doc = await self.__users.find_one({"verification_token": token}, session=session)
        if not doc:
            return None
        return UserDataOut.from_doc(doc)

    async def get_user_doc_by_verification_token(self, token: str, session=None) -> dict[str, Any] | None:
        return await self.__users.find_one({"verification_token": token}, session=session)

    async def verify_email(self, user_id: str | ObjectId, session=None) -> None:
        await self.__users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {"email_verified": True},
                "$unset": {
                    "verification_token": "",
                    "verification_token_expires": "",
                },
            },
            session=session,
        )

    async def update_verification_token(
        self,
        user_id: str | ObjectId,
        token: str,
        expires_at: datetime,
        *,
        session=None,
    ) -> None:
        await self.__users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "verification_token": token,
                    "verification_token_expires": expires_at,
                }
            },
            session=session,
        )

    async def change_password(
        self,
        user_id: str | ObjectId,
        current_password: str,
        new_password: str,
        *,
        session=None,
    ) -> bool:
        try:
            object_id = ObjectId(user_id)
        except Exception:
            return False

        doc = await self.__users.find_one(
            {"_id": object_id},
            projection={"password": 1},
            session=session,
        )
        if not doc:
            return False

        stored_hash = doc.get("password")
        if not stored_hash or not bcrypt.checkpw(current_password.encode("utf-8"), stored_hash):
            return False

        is_valid, error_msg = validate_password(new_password)
        if not is_valid:
            raise ValueError(error_msg or "Invalid password")

        if bcrypt.checkpw(new_password.encode("utf-8"), stored_hash):
            raise ValueError("New password must be different from the current password")

        start_time = time.time()
        new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
        elapsed = time.time() - start_time
        if elapsed > 0.5:
            logger.warning("Password hashing during change took %.2fs", elapsed)

        result = await self.__users.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "password": new_hash,
                    "password_updated_at": datetime.now(timezone.utc),
                }
            },
            session=session,
        )
        return result.modified_count == 1

    async def add_liked_event(
        self,
        user_id: str,
        *,
        event_id: str,
        session=None,
    ) -> UserDataOut | None:
        event_id_str = str(event_id).strip()
        if not event_id_str:
            return await self.get_user(user_id, session=session)

        result = await self.__users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$addToSet": {"likedEvents": event_id_str}},
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        return UserDataOut.from_doc(result) if result else None

    async def remove_liked_event(
        self,
        user_id: str,
        *,
        event_id: str,
        session=None,
    ) -> UserDataOut | None:
        event_id_str = str(event_id).strip()
        if not event_id_str:
            return await self.get_user(user_id, session=session)

        result = await self.__users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$pull": {"likedEvents": event_id_str}},
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        return UserDataOut.from_doc(result) if result else None
