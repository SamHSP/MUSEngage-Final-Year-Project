from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict  # Data model

class NotificationType(str, Enum):
    EVENT_CREATED = "event_created"
    POLL_FINALIZED = "poll_finalized"
    FEEDBACK_SUBMITTED = "feedback_submitted"
    POST_REJECTED = "post_rejected"
    ADMIN_BROADCAST = "admin_broadcast"


class NotificationData(BaseModel):
    id: str
    recipientId: str
    type: NotificationType
    title: str
    body: str
    url: str | None = None
    createdAt: datetime
    read: bool
    readAt: datetime | None = None

    @staticmethod
    def from_doc(doc) -> "NotificationData":
        type_value = doc.get("type", NotificationType.ADMIN_BROADCAST.value)
        try:
            notification_type = NotificationType(type_value)
        except ValueError:
            notification_type = NotificationType.ADMIN_BROADCAST
        return NotificationData(
            id=str(doc["_id"]),
            recipientId=str(doc.get("recipient_id")),
            type=notification_type,
            title=doc.get("title", ""),
            body=doc.get("body", ""),
            url=doc.get("url"),
            createdAt=doc.get("created_at"),
            read=bool(doc.get("read", False)),
            readAt=doc.get("read_at"),
        )


class UserDataIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    email: str
    name: str
    password: str
    role: str
    rewardPoints: int = 0
    likedEvents: list[str] = Field(default_factory=list)
    profileImageUrl: str | None = None
    email_verified: bool = Field(default=False, serialization_alias="emailVerified")

    @staticmethod
    def from_doc(doc) -> "UserDataIn":
        return UserDataIn(
                id=str(doc["_id"]),
                email= doc["email"],
                name=doc["name"],
                password=doc["password"],
                role=doc.get("role", "student"),
                rewardPoints=doc.get("rewardPoints", 0),
                likedEvents=[
                    str(event_id)
                    for event_id in doc.get("likedEvents", [])
                    if isinstance(event_id, (str, bytes))
                ],
                profileImageUrl=doc.get("profileImageUrl"),
                email_verified=bool(doc.get("email_verified", False)),
                )

class UserDataOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    email: str
    name: str
    role: str
    rewardPoints: int = 0
    likedEvents: list[str] = Field(default_factory=list)
    profileImageUrl: str | None = None
    email_verified: bool = Field(default=False, serialization_alias="emailVerified")

    @staticmethod
    def from_doc(doc) -> "UserDataOut":
        return UserDataOut(
                id=str(doc["_id"]),
                email= doc["email"],
                name=doc["name"],
                role=doc.get("role", "student"),
                rewardPoints=doc.get("rewardPoints", 0),
                likedEvents=[
                    str(event_id)
                    for event_id in doc.get("likedEvents", [])
                    if isinstance(event_id, (str, bytes))
                ],
                profileImageUrl=doc.get("profileImageUrl"),
                email_verified=bool(doc.get("email_verified", False)),
                )




class ListSummary(BaseModel):
    id: str
    name: str
    item_count: int
    
    @staticmethod
    def from_doc(doc) -> "ListSummary":
        return ListSummary(
                id=str(doc["_id"]),
                name=doc["name"],
                item_count=doc["item_count"],
                )


class ListItem(BaseModel):
    id: str
    label: str
    checked: bool

    @staticmethod
    def from_doc(item) -> "ListItem":
        return ListItem(
                id=item["id"],
                label=item["label"],
                checked=item["checked"],
                )

class List(BaseModel):
    id:str
    name:str
    items: list[ListItem]

    @staticmethod
    def from_doc(doc) -> "List":
        return List(
                id=str(doc["_id"]),
                name=doc["name"],
                items=[ListItem.from_doc(item) for item in doc["items"]],
                )



class CommentData(BaseModel):
    id: str
    authorId: str
    authorName: str
    authorEmail: str
    authorProfileImageUrl: str | None = None
    content: str
    createdAt: datetime

    @staticmethod
    def from_doc(doc) -> "CommentData":
        return CommentData(
            id=doc["id"],
            authorId=str(doc["author_id"]),
            authorName=doc["author_name"],
            authorEmail=doc["author_email"],
            authorProfileImageUrl=doc.get("author_profile_image_url"),
            content=doc["content"],
            createdAt=doc["created_at"],
        )


class PostData(BaseModel):
    id: str
    authorId: str
    authorName: str
    authorEmail: str
    authorProfileImageUrl: str | None = None
    title: str
    content: str
    createdAt: datetime
    comments: list[CommentData]
    flair: str | None = None
    imageUrl: str | None = None
    updatedAt: datetime | None = None
    upvoteCount: int = 0
    upvoters: list[str] = Field(default_factory=list)

    @staticmethod
    def from_doc(doc) -> "PostData":
        upvoter_ids = [str(value) for value in doc.get("upvoters", [])]
        return PostData(
            id=str(doc["_id"]),
            authorId=str(doc["author_id"]),
            authorName=doc["author_name"],
            authorEmail=doc["author_email"],
            authorProfileImageUrl=doc.get("author_profile_image_url"),
            title=doc.get("title", ""),
            content=doc["content"],
            createdAt=doc["created_at"],
            comments=[CommentData.from_doc(comment) for comment in doc.get("comments", [])],
            flair=doc.get("flair"),
            imageUrl=doc.get("image_url"),
            updatedAt=doc.get("updated_at"),
            upvoteCount=len(upvoter_ids),
            upvoters=upvoter_ids,
        )


class PostSubmissionStatus(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class PostModerationStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class PostModerationSummary(BaseModel):
    id: str
    status: PostSubmissionStatus
    reason: str
    categories: list[str] = Field(default_factory=list)

    @staticmethod
    def from_record(record: "PostModerationRecord") -> "PostModerationSummary":
        return PostModerationSummary(
            id=record.id,
            status=PostSubmissionStatus.REJECTED,
            reason=record.reason,
            categories=record.categories,
        )


class PostModerationRecord(BaseModel):
    id: str
    authorId: str
    authorName: str
    authorEmail: str
    title: str
    content: str
    flair: str | None = None
    imageUrl: str | None = None
    submittedAt: datetime
    reason: str
    categories: list[str] = Field(default_factory=list)
    status: PostModerationStatus = Field(default=PostModerationStatus.PENDING_REVIEW)
    decidedAt: datetime | None = None
    decidedBy: str | None = None
    decidedByName: str | None = None
    adminNote: str | None = None
    postId: str | None = None

    @staticmethod
    def from_doc(doc) -> "PostModerationRecord":
        categories = [str(item) for item in doc.get("categories", []) if isinstance(item, (str, bytes))]
        return PostModerationRecord(
            id=str(doc["_id"]),
            authorId=str(doc["author_id"]),
            authorName=doc.get("author_name", ""),
            authorEmail=doc.get("author_email", ""),
            title=doc.get("title", ""),
            content=doc.get("content", ""),
            flair=doc.get("flair"),
            imageUrl=doc.get("image_url"),
            submittedAt=doc["submitted_at"],
            reason=doc.get("reason", ""),
            categories=categories,
            status=PostModerationStatus(doc.get("status", PostModerationStatus.PENDING_REVIEW.value)),
            decidedAt=doc.get("decided_at"),
            decidedBy=str(doc["decided_by"]) if doc.get("decided_by") else None,
            decidedByName=doc.get("decided_by_name"),
            adminNote=doc.get("admin_note"),
            postId=str(doc["post_id"]) if doc.get("post_id") else None,
        )


class PostSubmissionResponse(BaseModel):
    status: PostSubmissionStatus
    post: PostData | None = None
    moderation: PostModerationSummary | None = None

