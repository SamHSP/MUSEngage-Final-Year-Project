from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import ReturnDocument

from model import PostData, UserDataOut


class PostsDAL:
    """Data access layer for community posts and comments."""

    def __init__(self, posts: AsyncIOMotorCollection):
        self._posts = posts

    async def list_posts(self) -> list[PostData]:
        cursor = self._posts.find().sort("created_at", -1)
        results: list[PostData] = []
        async for doc in cursor:
            results.append(PostData.from_doc(doc))
        return results

    async def create_post(
        self,
        *,
        author: UserDataOut,
        title: str,
        content: str,
        flair: str | None = None,
        image_url: str | None = None,
        created_at: datetime | None = None,
        session: Any = None,
    ) -> PostData:
        now = created_at or datetime.now(timezone.utc)
        doc: dict[str, Any] = {
            "author_id": ObjectId(author.id),
            "author_name": author.name,
            "author_email": author.email,
            "author_profile_image_url": author.profileImageUrl,
            "title": title,
            "content": content,
            "created_at": now,
            "updated_at": now,
            "comments": [],
            "upvoters": [],
        }
        if flair is not None:
            doc["flair"] = flair
        if image_url is not None:
            doc["image_url"] = image_url
        result = await self._posts.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return PostData.from_doc(doc)

    async def add_comment(
        self,
        post_id: str,
        *,
        author: UserDataOut,
        content: str,
        session: Any = None,
    ) -> PostData | None:
        now = datetime.now(timezone.utc)
        comment = {
            "id": uuid4().hex,
            "author_id": ObjectId(author.id),
            "author_name": author.name,
            "author_email": author.email,
            "author_profile_image_url": author.profileImageUrl,
            "content": content,
            "created_at": now,
        }
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return None

        updated = await self._posts.find_one_and_update(
            {"_id": post_object_id},
            {"$push": {"comments": comment}, "$set": {"updated_at": now}},
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return None
        return PostData.from_doc(updated)

    async def add_upvote(
        self,
        post_id: str,
        *,
        user: UserDataOut,
        session: Any = None,
    ) -> PostData | None:
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return None

        now = datetime.now(timezone.utc)

        updated = await self._posts.find_one_and_update(
            {"_id": post_object_id},
            {
                "$addToSet": {"upvoters": ObjectId(user.id)},
                "$set": {"updated_at": now},
            },
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return None
        return PostData.from_doc(updated)

    async def remove_upvote(
        self,
        post_id: str,
        *,
        user: UserDataOut,
        session: Any = None,
    ) -> PostData | None:
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return None

        now = datetime.now(timezone.utc)

        updated = await self._posts.find_one_and_update(
            {"_id": post_object_id},
            {
                "$pull": {"upvoters": ObjectId(user.id)},
                "$set": {"updated_at": now},
            },
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return None
        return PostData.from_doc(updated)

    async def get_post(self, post_id: str) -> PostData | None:
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return None

        doc = await self._posts.find_one({"_id": post_object_id})
        if not doc:
            return None
        return PostData.from_doc(doc)

    async def update_post(
        self,
        post_id: str,
        *,
        updates: dict[str, Any],
        session: Any = None,
    ) -> PostData | None:
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return None

        update: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        update.update(updates)

        updated = await self._posts.find_one_and_update(
            {"_id": post_object_id},
            {"$set": update},
            session=session,
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return None
        return PostData.from_doc(updated)

    async def delete_post(self, post_id: str, *, session: Any = None) -> bool:
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return False
        result = await self._posts.delete_one({"_id": post_object_id}, session=session)
        return result.deleted_count == 1

    async def delete_comment(
        self,
        post_id: str,
        comment_id: str,
        *,
        session: Any = None,
    ) -> PostData | None:
        try:
            post_object_id = ObjectId(post_id)
        except Exception:
            return None

        update_result = await self._posts.update_one(
            {"_id": post_object_id, "comments.id": comment_id},
            {
                "$pull": {"comments": {"id": comment_id}},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
            session=session,
        )

        if update_result.modified_count == 0:
            return None

        doc = await self._posts.find_one({"_id": post_object_id}, session=session)
        return PostData.from_doc(doc) if doc else None

    async def list_posts_by_author(self, author_id: str, *, session: Any = None) -> list[PostData]:
        try:
            object_id = ObjectId(author_id)
        except Exception:
            return []
        cursor = (
            self._posts.find({"author_id": object_id}, session=session)
            .sort("created_at", -1)
        )
        posts: list[PostData] = []
        async for doc in cursor:
            posts.append(PostData.from_doc(doc))
        return posts

    async def anonymize_user_posts(self, user_id: str, *, session: Any = None) -> int:
        try:
            object_id = ObjectId(user_id)
        except Exception:
            return 0

        now = datetime.now(timezone.utc)
        anonymised_author_id = ObjectId()

        update_posts = await self._posts.update_many(
            {"author_id": object_id},
            {
                "$set": {
                    "author_id": anonymised_author_id,
                    "author_name": "Deleted user",
                    "author_email": "",
                    "author_profile_image_url": None,
                    "updated_at": now,
                }
            },
            session=session,
        )

        update_comments = await self._posts.update_many(
            {"comments.author_id": object_id},
            {
                "$set": {
                    "comments.$[comment].author_id": anonymised_author_id,
                    "comments.$[comment].author_name": "Deleted user",
                    "comments.$[comment].author_email": "",
                    "comments.$[comment].author_profile_image_url": None,
                    "updated_at": now,
                }
            },
            array_filters=[{"comment.author_id": object_id}],
            session=session,
        )

        return int(update_posts.modified_count + update_comments.modified_count)
