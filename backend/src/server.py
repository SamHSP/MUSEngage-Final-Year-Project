import asyncio
import json
# import sys
import inspect
import os
import logging
import re
import secrets
import time
import smtplib
from collections import Counter
from decimal import Decimal
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from io import BytesIO
from math import sqrt
from typing import Annotated, Any, Literal, Sequence

import filetype
from PIL import Image
import stripe
import uvicorn
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import (
    FastAPI,
    status,
    HTTPException,
    UploadFile,
    File,
    Response,
    Query,
    Depends,
    Request,
    Body,
)
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from fastapi.middleware.cors import CORSMiddleware
from azure.storage.blob import BlobServiceClient, ContentSettings
from uuid import uuid4
import pyqrcode
import httpx
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from fastapi_csrf_protect import CsrfProtect
from fastapi_csrf_protect.exceptions import CsrfProtectError
from starlette.middleware.base import BaseHTTPMiddleware

# Local files
from model import *
from analytics import AnalyticsService
from UserDAL import UserDAL, validate_password
from EmailOTP import OTPDAL, SENDER_EMAIL, SENDER_PASSWORD, SMTP_SERVER, SMTP_PORT
from EventsDAL import EventsDAL, EventData
from ItemsDAL import ItemsDAL, ItemData
from PurchasesDAL import PurchasesDAL, PurchaseRecordData
from PollsDAL import PollsDAL, PollData
from CompetitionsDAL import (
    CompetitionsDAL,
    CompetitionData,
    CompetitionSubmissionData,
)
from RewardsDAL import (
    RewardsDAL,
    RewardData,
    RewardRedemptionData,
    RewardRedemptionStatus,
)
from PassDAL import PassDAL, PassSessionData
from PostsDAL import PostsDAL
from PostModerationDAL import PostModerationDAL
from FeedbackDAL import FeedbackDAL, FeedbackData, FeedbackStatus
from NotificationsDAL import NotificationsDAL, PushSubscriptionDAL
from ModeratorAI import moderator_ai_response
from pywebpush import WebPushException, webpush

# Global Vars
MONGODB_URI = os.environ["MONGODB_URI"]
ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
DEBUG = ENVIRONMENT == "development" and os.getenv("DEBUG", "false").strip().lower() in {
    "1",
    "true",
    "on",
    "yes",
}
if ENVIRONMENT == "production" and DEBUG:
    raise RuntimeError("DEBUG mode cannot be enabled in production environment")

security_logger = logging.getLogger("musengage.security")

CONTAINER = "uploads"
CONN_STR = os.getenv("BLOB_CONNECTION_STRING")
if not CONN_STR:
    raise ValueError("AZURE_STORAGE_CONNECTION_STRING is not set")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
if not STRIPE_SECRET_KEY:
    raise ValueError("STRIPE_SECRET_KEY is not set")
stripe.api_key = STRIPE_SECRET_KEY
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXPIRY_MINUTES = int(os.getenv("JWT_EXPIRY_MINUTES", "15"))
if not 5 <= JWT_EXPIRY_MINUTES <= 60:
    raise ValueError("JWT_EXPIRY_MINUTES must be between 5 and 60 minutes for security")
JWT_ALGORITHM = "HS256"
REFRESH_TOKEN_DAYS = int(os.getenv("JWT_REFRESH_DAYS", "7"))
if not 1 <= REFRESH_TOKEN_DAYS <= 30:
    raise ValueError("JWT_REFRESH_DAYS must be between 1 and 30 days for security")
ACCESS_TOKEN_COOKIE_NAME = "access_token"
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN") or None
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").strip().lower() in {"1", "true", "on", "yes"}
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
REDIS_URL = os.getenv("REDIS_URL")
CSP_DIRECTIVES = os.getenv(
    "CSP_DIRECTIVES",
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; "
    "frame-ancestors 'none'; form-action 'self';",
)

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4096
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
STUDENT_EMAIL_PATTERN = re.compile(r"^\d{8}@student\.murdoch\.edu\.au$")

VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_CLAIM_EMAIL = os.getenv("VAPID_CLAIM_EMAIL", "mailto:support@musengage.site")
PUSH_NOTIFICATIONS_ENABLED = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)

AZURE_EMBEDDING_ENDPOINT = os.getenv("AZURE_EMBEDDING_ENDPOINT")
AZURE_EMBEDDING_KEY = os.getenv("AZURE_EMBEDDING_KEY")
AZURE_EMBEDDING_TIMEOUT = float(os.getenv("AZURE_EMBEDDING_TIMEOUT", "10"))
EMBEDDING_ENABLED = bool(AZURE_EMBEDDING_ENDPOINT and AZURE_EMBEDDING_KEY)

logger = logging.getLogger("musengage.recommendations")
qr_logger = logging.getLogger("musengage.qr")


def _create_rate_limiter() -> Limiter:
    storage_uri = REDIS_URL or "memory://"
    try:
        return Limiter(key_func=get_remote_address, default_limits=["100/15minutes"], storage_uri=storage_uri)
    except Exception as exc:  # pragma: no cover - defensive
        security_logger.warning("Falling back to in-memory rate limiter: %s", exc)
        return Limiter(key_func=get_remote_address, default_limits=["100/15minutes"])


limiter = _create_rate_limiter()


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    security_logger.warning(
        "Rate limit exceeded: path=%s, client=%s, detail=%s",
        request.url.path,
        get_remote_address(request),
        getattr(exc, "detail", None),
    )
    response = _rate_limit_exceeded_handler(request, exc)
    if inspect.isawaitable(response):
        response = await response
    return response


def authenticated_user_rate_limit_key(request: Request) -> str:
    user_identifier = getattr(request.state, "authenticated_user_id", None)
    if user_identifier:
        return str(user_identifier)
    email = getattr(request.state, "authenticated_user_email", None)
    if email:
        return str(email)
    return get_remote_address(request)


def sanitize_filename(filename: str) -> str:
    base = os.path.basename(filename or "upload")
    base = base.replace("..", "")
    base = re.sub(r"[^A-Za-z0-9._-]", "", base)
    if len(base) > 255:
        base = base[-255:]
    ext = os.path.splitext(base)[1].lower()
    return f"{uuid4().hex}{ext}"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = CSP_DIRECTIVES
        return response


class CsrfSettings(BaseModel):
    secret_key: str = os.getenv("CSRF_SECRET_KEY") or secrets.token_urlsafe(32)
    cookie_name: str = "fastapi-csrf-token"
    header_name: str = "X-CSRF-Token"
    cookie_secure: bool = COOKIE_SECURE
    cookie_samesite: str = COOKIE_SAMESITE
    cookie_domain: str | None = COOKIE_DOMAIN
    cookie_httponly: bool = True  # Security fix: Prevent XSS access to CSRF token


@CsrfProtect.load_config
def get_csrf_config() -> CsrfSettings:
    return CsrfSettings()


csrf_logger = logging.getLogger("musengage.security.csrf")


async def enforce_csrf(request: Request, csrf_protect: CsrfProtect = Depends()) -> None:
    if request.method.upper() in SAFE_METHODS:
        return
    
    # Exempt certain paths from CSRF validation
    exempt_paths = {
        "/api/users/validate",
        "/api/users/check_credentials",
        "/api/otp/request",
        "/api/otp/verify",
        "/api/auth/register",
        "/api/auth/verify-email",
        "/api/auth/resend-verification",
        "/api/csrf-token",
        "/api/refresh",
        "/api/logout",
    }

    if request.url.path in exempt_paths:
        return

    result = csrf_protect.validate_csrf(request)
    if inspect.isawaitable(result):
        await result

class LoginAttemptTracker:
    MAX_ATTEMPTS = 5
    LOCKOUT_DURATION_MINUTES = 30

    def __init__(self, collection):
        self._collection = collection

    async def ensure_indexes(self):
        await self._collection.create_index("email", unique=True)
        await self._collection.create_index("locked_until", expireAfterSeconds=0)

    async def is_locked(self, email: str) -> tuple[bool, datetime | None]:
        now = datetime.now(timezone.utc)
        record = await self._collection.find_one({"email": email.strip().lower()})
        if not record:
            return False, None
        locked_until = record.get("locked_until")
        if locked_until and locked_until > now:
            return True, locked_until
        if locked_until and locked_until <= now:
            await self.reset_attempts(email)
        return False, None

    async def record_failed_attempt(self, email: str) -> tuple[bool, datetime | None]:
        now = datetime.now(timezone.utc)
        email_key = email.strip().lower()
        record = await self._collection.find_one({"email": email_key})
        if not record:
            await self._collection.insert_one(
                {
                    "email": email_key,
                    "attempt_count": 1,
                    "last_attempt": now,
                    "locked_until": None,
                }
            )
            return False, None

        locked_until = record.get("locked_until")
        if locked_until and locked_until > now:
            return True, locked_until

        attempt_count = int(record.get("attempt_count", 0)) + 1
        update: dict[str, Any] = {
            "attempt_count": attempt_count,
            "last_attempt": now,
        }
        locked_until_result: datetime | None = None
        if attempt_count >= self.MAX_ATTEMPTS:
            locked_until_result = now + timedelta(minutes=self.LOCKOUT_DURATION_MINUTES)
            update["locked_until"] = locked_until_result
            security_logger.error("Account locked after failed attempts: %s", email_key)
        await self._collection.update_one(
            {"_id": record["_id"]},
            {"$set": update},
        )
        return locked_until_result is not None, locked_until_result

    async def reset_attempts(self, email: str) -> None:
        await self._collection.delete_one({"email": email.strip().lower()})


def _send_verification_email_sync(email: str, token: str) -> None:
    verification_link = f"{FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = email
    msg["Subject"] = "MUSEngage - Verify Your Email Address"
    body = (
        "Welcome to MUSEngage!\n\n"
        "Please verify your email address by clicking the link below:\n"
        f"{verification_link}\n\n"
        "This link will expire in 24 hours.\n\n"
        "If you did not create this account, please ignore this email.\n"
    )
    msg.attach(MIMEText(body, "plain"))

    if not (SENDER_EMAIL and SENDER_PASSWORD):
        security_logger.warning("Email credentials missing; cannot send verification email to %s", email)
        return

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, email, msg.as_string())
    except Exception as exc:  # pragma: no cover - network interaction
        security_logger.error("Failed to send verification email to %s: %s", email, exc)


async def send_verification_email(email: str, token: str) -> None:
    await asyncio.to_thread(_send_verification_email_sync, email, token)


def _send_account_lock_email_sync(email: str, locked_until: datetime) -> None:
    if not (SENDER_EMAIL and SENDER_PASSWORD):
        security_logger.warning("Email credentials missing; cannot send lock notification to %s", email)
        return
    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = email
    msg["Subject"] = "MUSEngage Account Locked"
    body = (
        "Your MUSEngage account has been locked due to multiple failed login attempts.\n\n"
        f"The account will unlock automatically after {locked_until.isoformat()}.\n"
        "If this wasn't you, please contact support immediately.\n"
    )
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, email, msg.as_string())
    except Exception as exc:  # pragma: no cover - network interaction
        security_logger.error("Failed to send account lock email to %s: %s", email, exc)


async def send_account_lock_email(email: str, locked_until: datetime) -> None:
    await asyncio.to_thread(_send_account_lock_email_sync, email, locked_until)


def _format_currency(cents: int) -> str:
    dollars = (Decimal(cents) / Decimal(100)).quantize(Decimal("0.01"))
    return f"${dollars:,.2f}"


def _send_purchase_receipt_email_sync(
    email: str,
    shipping_address: str,
    items: Sequence[dict[str, Any]],
    total_amount: int,
    checkout_url: str | None = None,
) -> None:
    if not (SENDER_EMAIL and SENDER_PASSWORD):
        security_logger.warning(
            "Email credentials missing; cannot send purchase receipt to %s", email
        )
        return

    lines = ["Thank you for shopping with MUSEngage!", "", "Order summary:"]
    for item in items:
        name = str(item.get("name", "Item")).strip() or "Item"
        quantity = max(1, int(item.get("quantity", 1)))
        price = max(0, int(item.get("price", 0)))
        lines.append(f"- {name} × {quantity} — {_format_currency(price * quantity)}")

    lines.extend(
        [
            "",
            f"Shipping address:\n{shipping_address}",
            "",
            f"Order total: {_format_currency(total_amount)}",
        ]
    )

    if checkout_url:
        lines.extend(["", f"Checkout link: {checkout_url}"])

    lines.append("\nWe will notify you once your payment is confirmed.")

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = email
    msg["Subject"] = "MUSEngage purchase confirmation"
    msg.attach(MIMEText("\n".join(lines), "plain"))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, email, msg.as_string())
    except Exception as exc:  # pragma: no cover - network interaction
        security_logger.error("Failed to send purchase receipt email to %s: %s", email, exc)


async def send_purchase_receipt_email(
    email: str,
    shipping_address: str,
    items: Sequence[dict[str, Any]],
    total_amount: int,
    checkout_url: str | None = None,
) -> None:
    await asyncio.to_thread(
        _send_purchase_receipt_email_sync,
        email,
        shipping_address,
        items,
        total_amount,
        checkout_url,
    )



def normalise_event_tags(tags: Sequence[str], limit: int | None = None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        if not isinstance(tag, str):
            continue
        value = tag.strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(value)
        if limit is not None and len(cleaned) >= limit:
            break
    return cleaned


def compose_event_embedding_text(
    *, title: str, sub_header: str | None, body: str, tags: Sequence[str]
) -> str:
    parts = [title.strip()]
    if sub_header:
        parts.append(sub_header.strip())
    parts.append(body.strip())
    if tags:
        parts.append("Tags: " + ", ".join(tags))
    return "\n\n".join(part for part in parts if part)


async def fetch_event_embedding(text: str) -> list[float] | None:
    if not EMBEDDING_ENABLED:
        return None
    payload = {"input": text}
    headers = {
        "api-key": AZURE_EMBEDDING_KEY,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=AZURE_EMBEDDING_TIMEOUT) as client:
            response = await client.post(AZURE_EMBEDDING_ENDPOINT, headers=headers, json=payload)
            response.raise_for_status()
    except Exception as exc:  # broad but logged for observability
        logger.warning("Embedding request failed: %s", exc)
        return None

    try:
        data = response.json()
        embedding = data["data"][0]["embedding"]
        if isinstance(embedding, list):
            return [float(value) for value in embedding]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        logger.warning("Unexpected embedding response payload: %s", exc)
    return None


async def build_event_embedding(
    *, title: str, sub_header: str | None, body: str, tags: Sequence[str]
) -> list[float] | None:
    text = compose_event_embedding_text(title=title, sub_header=sub_header, body=body, tags=tags)
    if not text.strip():
        return None
    return await fetch_event_embedding(text)


async def ensure_event_embedding(event: EventData, embedding: list[float] | None) -> list[float] | None:
    if embedding is not None:
        return embedding
    generated = await build_event_embedding(
        title=event.title,
        sub_header=event.sub_header,
        body=event.body,
        tags=event.tags,
    )
    if generated is not None:
        try:
            await app.state.events.update_event_embedding(event.id, embedding=generated)
        except Exception as exc:
            logger.warning("Failed to persist embedding for event %s: %s", event.id, exc)
    return generated


def cosine_similarity(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
    if len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sqrt(sum(a * a for a in vec_a))
    norm_b = sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    value = dot / (norm_a * norm_b)
    return max(0.0, float(value))


def compute_recency_boost(created_at: datetime) -> float:
    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None or created_at.tzinfo.utcoffset(created_at) is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    delta = now - created_at
    days = delta.total_seconds() / 86400
    if days <= 0:
        return 1.0
    if days >= 60:
        return 0.0
    return max(0.0, 1 - (days / 60))


def build_reasons(
    event: EventData,
    tag_counter: Counter[str],
    *,
    similarity: float,
    tag_overlap: float,
    fallback: bool,
) -> list[str]:
    reasons: list[str] = []
    overlapping_tags = [tag for tag in event.tags if tag_counter.get(tag.lower())]
    if overlapping_tags:
        preview_tags = ", ".join(overlapping_tags[:2])
        reasons.append(f"Shares your interest in {preview_tags}.")
    if similarity >= 0.6:
        reasons.append("Closely matches events you've liked.")
    elif similarity >= 0.2:
        reasons.append("Has similar themes to your liked events.")
    if event.rsvp and event.rsvp.reward_points:
        reasons.append(f"Earn {int(event.rsvp.reward_points)} reward points when you attend.")
    if fallback or not reasons:
        reasons.append("Popular with Murdoch students this month.")
    return reasons


async def _send_web_push(subscription: dict, payload: dict) -> None:
    if not PUSH_NOTIFICATIONS_ENABLED:
        return
    endpoint = subscription.get("endpoint")
    if not endpoint:
        return
    subscription_info = {"endpoint": endpoint, "keys": subscription.get("keys", {})}
    try:
        await asyncio.to_thread(
            webpush,
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIM_EMAIL},
        )
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in {404, 410}:
            await app.state.push_subscriptions.remove_by_endpoint(endpoint)
        else:
            logger.warning("Failed to deliver push notification to %s: %s", endpoint, exc)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Unexpected web push error for %s: %s", endpoint, exc)


async def _dispatch_push_notifications(notifications: Sequence[NotificationData]) -> None:
    if not PUSH_NOTIFICATIONS_ENABLED or not notifications:
        return
    recipients: dict[str, list[NotificationData]] = {}
    for notification in notifications:
        recipient_id = str(notification.recipientId)
        recipients.setdefault(recipient_id, []).append(notification)
    subscriptions = await app.state.push_subscriptions.list_subscriptions(recipients.keys())
    tasks: list[asyncio.Task] = []
    for subscription in subscriptions:
        user_id = str(subscription.get("user_id"))
        user_notifications = recipients.get(user_id, [])
        for notification in user_notifications:
            payload = {
                "title": notification.title,
                "body": notification.body,
                "url": notification.url,
                "notificationId": notification.id,
                "type": notification.type.value,
            }
            tasks.append(asyncio.create_task(_send_web_push(subscription, payload)))
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def notify_user(
    *,
    recipient_id: str,
    notification_type: NotificationType,
    title: str,
    body: str,
    url: str | None = None,
) -> NotificationData | None:
    notification = await app.state.notifications.create_notification(
        recipient_id=recipient_id,
        notification_type=notification_type,
        title=title,
        body=body,
        url=url,
    )
    await _dispatch_push_notifications([notification])
    return notification


async def notify_users(
    recipients: Sequence[str],
    *,
    notification_type: NotificationType,
    title: str,
    body: str,
    url: str | None = None,
) -> list[NotificationData]:
    records = [
        (recipient_id, notification_type, title, body, url)
        for recipient_id in recipients
        if recipient_id
    ]
    notifications = await app.state.notifications.create_notifications(records)
    await _dispatch_push_notifications(notifications)
    return notifications

blob_service = BlobServiceClient.from_connection_string(CONN_STR)
container_client = blob_service.get_container_client(CONTAINER)

# Create container if container does not exist.
try:
    container_client.create_container()
except Exception:
    pass


def build_rsvp_qr_blob_name(event_id: str | None = None) -> str:
    unique = uuid4().hex
    if event_id:
        return f"rsvp-qr/{event_id}-{unique}.png"
    return f"rsvp-qr/{unique}.png"


def generate_qr_png(token: str, *, scale: int = 8, quiet_zone: int = 4) -> bytes:
    qr = pyqrcode.create(token, error="M")
    buffer = BytesIO()
    qr.png(buffer, scale=scale, quiet_zone=quiet_zone)
    return buffer.getvalue()


def upload_rsvp_qr_png(data: bytes, *, blob_name: str | None = None) -> tuple[str, str]:
    target_blob_name = blob_name or build_rsvp_qr_blob_name()
    blob_client = container_client.get_blob_client(target_blob_name)
    content_settings = ContentSettings(content_type="image/png")
    blob_client.upload_blob(data, overwrite=True, content_settings=content_settings)
    return blob_client.url, target_blob_name


def delete_rsvp_qr_blob(blob_name: str) -> None:
    try:
        container_client.delete_blob(blob_name)
    except Exception as exc:
        qr_logger.debug("Failed to delete RSVP QR blob %s: %s", blob_name, exc)


async def ensure_event_rsvp_qr(event: EventData, *, previous: EventData | None = None) -> EventData:
    current_rsvp = event.rsvp
    previous_rsvp = previous.rsvp if previous else None
    previous_blob = previous_rsvp.qr_code_blob_name if previous_rsvp else None
    previous_key = previous_rsvp.key if previous_rsvp else None

    if not current_rsvp or not current_rsvp.enabled or not current_rsvp.key:
        if previous_blob:
            delete_rsvp_qr_blob(previous_blob)
        if current_rsvp and (current_rsvp.qr_code_url or current_rsvp.qr_code_blob_name):
            updated = await app.state.events.set_rsvp_qr_code(
                event.id,
                qr_code_url=None,
                qr_code_blob_name=None,
            )
            if updated:
                event = updated
        return event

    regenerate = False
    if not current_rsvp.qr_code_url:
        regenerate = True
    if previous_key and current_rsvp.key != previous_key:
        regenerate = True

    blob_name = current_rsvp.qr_code_blob_name or build_rsvp_qr_blob_name(event.id)

    if regenerate:
        if previous_blob and previous_blob != blob_name:
            delete_rsvp_qr_blob(previous_blob)
        png_data = generate_qr_png(current_rsvp.key)
        url, stored_blob_name = upload_rsvp_qr_png(png_data, blob_name=blob_name)
        updated = await app.state.events.set_rsvp_qr_code(
            event.id,
            qr_code_url=url,
            qr_code_blob_name=stored_blob_name,
        )
        if updated:
            event = updated
        return event

    if previous_blob and previous_blob != blob_name and (not previous_key or previous_key == current_rsvp.key):
        delete_rsvp_qr_blob(previous_blob)

    return event

ValidRole = Literal["student", "admin"]

@asynccontextmanager
async def lifespan(app:FastAPI):
    # Configure MongoDB connection with proper timeouts and retry settings
    client = AsyncIOMotorClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=30000,  # 30 seconds for server selection
        connectTimeoutMS=30000,  # 30 seconds for initial connection
        socketTimeoutMS=30000,  # 30 seconds for socket operations
        retryWrites=True,
        retryReads=True,
        maxPoolSize=50,
        minPoolSize=10,
    )
    database = client.get_default_database()

    # Retry logic for initial connection
    max_retries = 5
    retry_delay = 2  # seconds

    for attempt in range(max_retries):
        try:
            pong = await database.command("ping")
            if int(pong["ok"]) != 1:
                raise Exception("Cluster connection is not okay!")
            logging.info("Successfully connected to MongoDB")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                logging.warning(
                    f"MongoDB connection attempt {attempt + 1}/{max_retries} failed: {e}. "
                    f"Retrying in {wait_time} seconds..."
                )
                await asyncio.sleep(wait_time)
            else:
                logging.error(f"Failed to connect to MongoDB after {max_retries} attempts")
                raise

    users = database.get_collection("users")
    otps = database.get_collection("otps")
    events = database.get_collection("events")
    items = database.get_collection("items")
    purchases = database.get_collection("purchases")
    posts = database.get_collection("posts")
    post_moderation = database.get_collection("post_moderation")
    rewards = database.get_collection("rewards")
    reward_redemptions = database.get_collection("reward_redemptions")
    polls = database.get_collection("polls")
    competitions = database.get_collection("competitions")
    feedbacks = database.get_collection("feedbacks")
    pass_collection = database.get_collection("pass")
    notifications_collection = database.get_collection("notifications")
    push_subscriptions_collection = database.get_collection("push_subscriptions")
    refresh_tokens_collection = database.get_collection("refresh_tokens")
    login_attempts_collection = database.get_collection("login_attempts")

    
    app.state.user = UserDAL(users) 
    app.state.otp = OTPDAL(otps)
    app.state.events = EventsDAL(events)
    app.state.items = ItemsDAL(items)
    app.state.purchases = PurchasesDAL(purchases)
    app.state.posts = PostsDAL(posts)
    app.state.post_moderation = PostModerationDAL(post_moderation)
    app.state.rewards = RewardsDAL(rewards, reward_redemptions)
    app.state.polls = PollsDAL(polls)
    app.state.competitions = CompetitionsDAL(competitions)
    app.state.feedback = FeedbackDAL(feedbacks)
    app.state.pass_sessions = PassDAL(pass_collection)
    app.state.notifications = NotificationsDAL(notifications_collection)
    app.state.push_subscriptions = PushSubscriptionDAL(push_subscriptions_collection)
    app.state.analytics = AnalyticsService(events, users)
    app.state.refresh_tokens_db = refresh_tokens_collection
    app.state.login_attempts = LoginAttemptTracker(login_attempts_collection)

    await app.state.rewards.ensure_indexes()
    await app.state.purchases.ensure_indexes()
    await app.state.polls.ensure_indexes()
    await app.state.competitions.ensure_indexes()
    await app.state.feedback.ensure_indexes()
    await app.state.pass_sessions.ensure_indexes()
    await app.state.notifications.ensure_indexes()
    await app.state.push_subscriptions.ensure_indexes()
    await app.state.login_attempts.ensure_indexes()
    await refresh_tokens_collection.create_index("expires_at", expireAfterSeconds=0)

    # Store MongoDB client and database in app state for health checks
    app.state.mongodb_client = client
    app.state.mongodb_database = database

    yield
    client.close()

app = FastAPI(lifespan=lifespan, debug=DEBUG, dependencies=[Depends(enforce_csrf)])
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://localhost:3000",
        "https://agreeable-dune-05762251e.2.azurestaticapps.net",
        "https://www.musengage.site",
        "https://musengage.site"
    ],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "Cookie"],
    allow_credentials=True,
)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)


@app.exception_handler(CsrfProtectError)
async def csrf_exception_handler(request: Request, exc: CsrfProtectError):
    csrf_logger.warning("CSRF validation failed for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=403, content={"detail": "CSRF token validation failed"})


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    logging.getLogger("musengage.errors").error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


@app.get("/health")
async def health_check():
    """Health check endpoint to verify service and MongoDB connectivity"""
    try:
        # Check MongoDB connection
        pong = await app.state.mongodb_database.command("ping")
        mongodb_status = "healthy" if int(pong.get("ok", 0)) == 1 else "unhealthy"
    except Exception as e:
        logging.error(f"MongoDB health check failed: {e}")
        mongodb_status = "unhealthy"

    return JSONResponse(
        status_code=200 if mongodb_status == "healthy" else 503,
        content={
            "status": "ok" if mongodb_status == "healthy" else "degraded",
            "mongodb": mongodb_status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


async def _store_refresh_token(token: str, user_id: str, expires_at: datetime) -> None:
    await app.state.refresh_tokens_db.insert_one(
        {
            "token": token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }
    )


async def _pop_refresh_token(token: str) -> None:
    await app.state.refresh_tokens_db.delete_one({"token": token})


async def _get_refresh_record(token: str) -> dict[str, Any] | None:
    record = await app.state.refresh_tokens_db.find_one(
        {
            "token": token,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    return record


def _create_access_token(user: UserDataOut) -> tuple[str, datetime]:
    if not user.id:
        raise HTTPException(status_code=500, detail="User missing identifier")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=JWT_EXPIRY_MINUTES)
    payload = {
        "sub": user.id,
        "role": user.role,
        "email": user.email,
        "name": user.name,
        "exp": expires_at,
        "iat": now,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, expires_at


async def _create_refresh_token(user: UserDataOut) -> tuple[str, datetime]:
    if not user.id:
        raise HTTPException(status_code=500, detail="User missing identifier")
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)
    await _store_refresh_token(token, user.id, expires_at)
    return token, expires_at


def _set_cookie(
    response: Response,
    *,
    key: str,
    value: str,
    max_age: int | None,
    expires: datetime | None,
) -> None:
    response.set_cookie(
        key=key,
        value=value,
        max_age=max_age,
        expires=expires,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
        domain=COOKIE_DOMAIN,
    )


async def _set_auth_cookies(response: Response, user: UserDataOut) -> None:
    access_token, access_expiry = _create_access_token(user)
    refresh_token, refresh_expiry = await _create_refresh_token(user)

    _set_cookie(
        response,
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=access_token,
        max_age=JWT_EXPIRY_MINUTES * 60,
        expires=access_expiry,
    )
    _set_cookie(
        response,
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_DAYS * 86400,
        expires=refresh_expiry,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        path="/",
        domain=COOKIE_DOMAIN,
    )
    response.delete_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        path="/",
        domain=COOKIE_DOMAIN,
    )


def _set_guest_access_cookie(response: Response, user: UserDataOut) -> None:
    access_token, access_expiry = _create_access_token(user)
    _set_cookie(
        response,
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=access_token,
        max_age=JWT_EXPIRY_MINUTES * 60,
        expires=access_expiry,
    )
    response.delete_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        path="/",
        domain=COOKIE_DOMAIN,
    )


async def get_current_user(request: Request) -> UserDataOut:
    token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    role = payload.get("role")
    if role == "guest":
        email = payload.get("email")
        name = payload.get("name") or "Guest"
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        request.state.authenticated_user_email = email
        request.state.authenticated_user_id = "guest"
        return UserDataOut(
            id="guest",
            email=email,
            name=name,
            role="guest",
            rewardPoints=0,
            likedEvents=[],
            profileImageUrl=None,
        )

    user_id = payload.get("sub")
    if not user_id or not role:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    request.state.authenticated_user_email = user.email
    request.state.authenticated_user_id = user.id
    return user


async def get_optional_user(request: Request) -> UserDataOut | None:
    try:
        return await get_current_user(request)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            return None
        raise


async def require_admin(current_user: UserDataOut = Depends(get_current_user)) -> UserDataOut:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


CurrentUser = Annotated[UserDataOut, Depends(get_current_user)]
OptionalCurrentUser = Annotated[UserDataOut | None, Depends(get_optional_user)]
NotificationPageSize = Annotated[int, Query(ge=1, le=100)]
RecommendationLimit = Annotated[int, Query(ge=1, le=12)]
AdminUser = Annotated[UserDataOut, Depends(require_admin)]

###############################################################################
# Notifications


class NotificationReadPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    read: bool = Field(default=True)


class NotificationMarkAllPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")


class NotificationClearPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")


class NotificationSubscriptionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    subscription: dict


class NotificationUnsubscribePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    endpoint: str


class AdminBroadcastPayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=500)


@app.get("/api/notifications", response_model=list[NotificationData])
async def list_notifications_for_user(
    current_user: CurrentUser,
    limit: NotificationPageSize = 25,
) -> list[NotificationData]:
    notifications = await app.state.notifications.list_notifications(
        current_user.id, limit=limit
    )
    return notifications


@app.post("/api/notifications/{notification_id}/read", response_model=NotificationData)
async def mark_notification_read(
    notification_id: str,
    payload: NotificationReadPayload,
    current_user: CurrentUser,
) -> NotificationData:
    notification = await app.state.notifications.mark_as_read(
        notification_id,
        read=payload.read,
        recipient_id=current_user.id,
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@app.post("/api/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: CurrentUser,
    _payload: NotificationMarkAllPayload | None = None,
) -> dict[str, int]:
    count = await app.state.notifications.mark_all_as_read(current_user.id)
    return {"updated": count}


@app.delete("/api/notifications")
async def clear_notifications(
    current_user: CurrentUser,
    _payload: NotificationClearPayload | None = None,
) -> dict[str, int]:
    count = await app.state.notifications.clear_notifications(current_user.id)
    return {"deleted": count}


@app.get("/api/notifications/vapid-public-key")
async def get_vapid_public_key() -> dict[str, str | None]:
    return {"publicKey": VAPID_PUBLIC_KEY if PUSH_NOTIFICATIONS_ENABLED else None}


@app.post("/api/notifications/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe_to_notifications(
    payload: NotificationSubscriptionPayload,
    current_user: CurrentUser,
) -> dict[str, bool]:
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot subscribe to notifications")
    subscription = payload.subscription or {}
    if not isinstance(subscription, dict) or not subscription.get("endpoint"):
        raise HTTPException(status_code=400, detail="Invalid subscription payload")
    await app.state.push_subscriptions.save_subscription(
        user_id=current_user.id, subscription=subscription
    )
    return {"ok": True}


@app.post("/api/notifications/unsubscribe")
async def unsubscribe_from_notifications(
    payload: NotificationUnsubscribePayload,
    current_user: CurrentUser,
) -> dict[str, bool]:
    removed = await app.state.push_subscriptions.remove_subscription(
        user_id=current_user.id,
        endpoint=payload.endpoint,
    )
    return {"ok": removed}


@app.post("/api/admin/notifications/broadcast")
async def broadcast_admin_notification(
    payload: AdminBroadcastPayload, admin_user: AdminUser
) -> dict[str, int]:
    recipients = await app.state.user.list_users_excluding_roles(["guest"])
    recipient_ids = [user.id for user in recipients if user.id]
    if not recipient_ids:
        return {"sent": 0}
    notifications = await notify_users(
        recipient_ids,
        notification_type=NotificationType.ADMIN_BROADCAST,
        title=payload.title.strip(),
        body=payload.body.strip(),
        url=f"{FRONTEND_URL}/dashboard",
    )
    return {"sent": len(notifications)}


@app.post("/api/admin/unlock-account/{user_id}")
async def unlock_account(user_id: str, admin_user: AdminUser) -> dict[str, str]:
    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await app.state.login_attempts.reset_attempts(user.email)
    security_logger.info("Account unlocked by admin %s for %s", admin_user.email, user.email)
    return {"message": "Account unlocked"}

###############################################################################
# PASS Sessions


class PassSessionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    meetingTime: str = Field(min_length=1, max_length=200)
    studentLecturer: str = Field(min_length=1, max_length=200)
    venue: str = Field(min_length=1, max_length=200)
    meetLink: str = Field(min_length=1, max_length=500)


class PassImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    sessions: list[PassSessionPayload] = Field(default_factory=list)


class PassImportResponse(BaseModel):
    added: list[PassSessionData]
    duplicateCount: int


@app.get("/api/pass/sessions", response_model=list[PassSessionData])
async def list_pass_sessions() -> list[PassSessionData]:
    return await app.state.pass_sessions.list_sessions()


@app.post(
    "/api/pass/sessions/import",
    response_model=PassImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_pass_sessions(payload: PassImportRequest, current_user: CurrentUser) -> PassImportResponse:
    if current_user.role not in {"student", "admin"}:
        raise HTTPException(status_code=403, detail="Only students and admins can import PASS sessions")
    if not payload.sessions:
        return PassImportResponse(added=[], duplicateCount=0)

    records = [
        {
            "meeting_time": session.meetingTime.strip(),
            "student_lecturer": session.studentLecturer.strip(),
            "venue": session.venue.strip(),
            "meet_link": session.meetLink.strip(),
        }
        for session in payload.sessions
    ]

    added, duplicates = await app.state.pass_sessions.import_sessions(records)
    return PassImportResponse(added=added, duplicateCount=duplicates)


@app.delete("/api/pass/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def clear_pass_sessions(current_user: CurrentUser) -> Response:
    if current_user.role not in {"student", "admin"}:
        raise HTTPException(
            status_code=403, detail="Only students and admins can clear PASS sessions"
        )
    await app.state.pass_sessions.clear_sessions()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


###############################################################################
# Items

class NewItem(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    availabilityCount: int = Field(ge=0)
    price: int = Field(ge=0, description="Price in cents (e.g., 500 == $5.00)")
    url: str | None = None

class UpdateItem(BaseModel):
    name: str | None = None
    description: str | None = None
    availabilityCount: int | None = Field(default=None, ge=0)
    price: int | None = Field(default=None, ge=0)
    url: str | None = None

class AdjustStock(BaseModel):
    delta: int  # can be negative (e.g., -1 to reserve / sell one)

@app.post("/api/items", status_code=status.HTTP_201_CREATED, response_model=ItemData)
async def create_item(new_item: NewItem, admin_user: AdminUser) -> ItemData:
    return await app.state.items.create_item(
        name=new_item.name.strip(),
        description=new_item.description.strip(),
        availabilityCount=new_item.availabilityCount,
        price=new_item.price,
        url=new_item.url,
    )

@app.get("/api/items", response_model=list[ItemData])
async def list_items() -> list[ItemData]:
    return await app.state.items.list_items()

@app.get("/api/items/{item_id}", response_model=ItemData)
async def get_item(item_id: str) -> ItemData:
    item = await app.state.items.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@app.patch("/api/items/{item_id}", response_model=ItemData)
async def patch_item(item_id: str, update: UpdateItem, admin_user: AdminUser) -> ItemData:
    item = await app.state.items.update_item(
        item_id,
        name=update.name.strip() if update.name is not None else None,
        description=update.description.strip() if update.description is not None else None,
        availabilityCount=update.availabilityCount,
        price=update.price,
        url=update.url,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@app.post("/api/items/{item_id}/stock", response_model=ItemData)
async def adjust_item_stock(item_id: str, payload: AdjustStock, admin_user: AdminUser) -> ItemData:
    updated = await app.state.items.adjust_stock(item_id, payload.delta)
    if not updated:
        raise HTTPException(status_code=400, detail="Stock update failed (insufficient inventory or item not found)")
    return updated

@app.delete("/api/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: str, admin_user: AdminUser):
    deleted = await app.state.items.delete_item(item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Item not found")

###############################################################################

# Rewards


class NewReward(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    pointsCost: int = Field(ge=0)
    stock: int = Field(default=0, ge=0)
    imageUrl: str | None = Field(default=None, max_length=2048)


class UpdateReward(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    pointsCost: int | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    imageUrl: str | None = Field(default=None, max_length=2048)


class RedeemRewardPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")


class RewardRedemptionResponse(BaseModel):
    ok: bool
    message: str
    totalRewardPoints: int
    redemption: RewardRedemptionData


class RewardRedemptionVerifyPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    token: str = Field(min_length=1)


class RewardRedemptionVerifyResponse(BaseModel):
    ok: bool
    message: str
    alreadyClaimed: bool
    redemption: RewardRedemptionData


@app.post("/api/rewards", status_code=status.HTTP_201_CREATED, response_model=RewardData)
async def create_reward(payload: NewReward, admin_user: AdminUser) -> RewardData:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Reward name cannot be empty")
    description = payload.description.strip()
    image_url = payload.imageUrl.strip() if payload.imageUrl else None
    return await app.state.rewards.create_reward(
        name=name,
        description=description,
        points_cost=payload.pointsCost,
        stock=payload.stock,
        image_url=image_url,
    )


@app.get("/api/rewards", response_model=list[RewardData])
async def list_rewards() -> list[RewardData]:
    return await app.state.rewards.list_rewards()


@app.get("/api/rewards/{reward_id}", response_model=RewardData)
async def get_reward(reward_id: str) -> RewardData:
    reward = await app.state.rewards.get_reward(reward_id)
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    return reward


@app.patch("/api/rewards/{reward_id}", response_model=RewardData)
async def update_reward(reward_id: str, payload: UpdateReward, admin_user: AdminUser) -> RewardData:
    updates = payload.dict(exclude_unset=True)
    kwargs: dict[str, str | int | None] = {}
    if "name" in updates:
        name_value = (updates["name"] or "").strip()
        if not name_value:
            raise HTTPException(status_code=400, detail="Reward name cannot be empty")
        kwargs["name"] = name_value
    if "description" in updates:
        description_value = updates["description"]
        kwargs["description"] = description_value.strip() if description_value else ""
    if "pointsCost" in updates:
        kwargs["points_cost"] = updates["pointsCost"]
    if "stock" in updates:
        kwargs["stock"] = updates["stock"]
    if "imageUrl" in updates:
        image_value = updates["imageUrl"]
        kwargs["image_url"] = image_value.strip() if image_value else None

    reward = await app.state.rewards.update_reward(reward_id, **kwargs)
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    return reward


@app.delete("/api/rewards/{reward_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reward(reward_id: str, admin_user: AdminUser):
    deleted = await app.state.rewards.delete_reward(reward_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Reward not found")


@app.post(
    "/api/rewards/{reward_id}/redeem",
    response_model=RewardRedemptionResponse,
)
async def redeem_reward(
    reward_id: str,
    payload: RedeemRewardPayload,
    current_user: CurrentUser,
) -> RewardRedemptionResponse:
    user = current_user
    if user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot redeem rewards")

    reward = await app.state.rewards.get_reward(reward_id)
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")

    if reward.stock <= 0:
        raise HTTPException(status_code=400, detail="Reward is out of stock")

    if reward.pointsCost > user.rewardPoints:
        raise HTTPException(
            status_code=400,
            detail="You do not have enough reward points for this redemption.",
        )

    updated_reward = await app.state.rewards.adjust_stock(reward_id, -1)
    if not updated_reward:
        raise HTTPException(status_code=400, detail="Reward is out of stock")

    updated_user = await app.state.user.adjust_reward_points(user.id, -reward.pointsCost)
    if not updated_user:
        await app.state.rewards.adjust_stock(reward_id, 1)
        raise HTTPException(
            status_code=400,
            detail="You do not have enough reward points for this redemption.",
        )

    token = uuid4().hex
    redemption = await app.state.rewards.create_redemption(
        reward=reward,
        user_id=user.id,
        user_name=user.name,
        token=token,
    )

    return RewardRedemptionResponse(
        ok=True,
        message=f"{reward.pointsCost} reward points redeemed for {reward.name}.",
        totalRewardPoints=updated_user.rewardPoints,
        redemption=redemption,
    )


@app.get(
    "/api/users/{user_id}/rewards/redemptions",
    response_model=list[RewardRedemptionData],
)
async def list_user_reward_redemptions(
    user_id: str, current_user: CurrentUser
) -> list[RewardRedemptionData]:
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorised to view redemptions")
    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await app.state.rewards.list_redemptions_for_user(user_id)


@app.get("/api/rewards/redemptions/{redemption_id}/qr.png")
async def get_reward_redemption_qr(redemption_id: str):
    redemption = await app.state.rewards.get_redemption(redemption_id)
    if not redemption:
        raise HTTPException(status_code=404, detail="Reward redemption not found")
    png_data = generate_qr_png(redemption.token)
    return Response(
        content=png_data,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@app.post(
    "/api/rewards/redemptions/verify",
    response_model=RewardRedemptionVerifyResponse,
)
async def verify_reward_redemption(
    payload: RewardRedemptionVerifyPayload,
    _admin_user: AdminUser,
) -> RewardRedemptionVerifyResponse:
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Reward token is required")

    result = await app.state.rewards.mark_redemption_claimed_by_token(token)
    if not result:
        raise HTTPException(status_code=404, detail="Invalid reward token")

    redemption, claimed_now = result
    already_claimed = redemption.status == RewardRedemptionStatus.CLAIMED and not claimed_now

    if claimed_now:
        message = f"{redemption.rewardName} marked as claimed."
    elif already_claimed:
        message = "This reward redemption has already been marked as claimed."
    else:
        message = "Reward redemption status updated."

    return RewardRedemptionVerifyResponse(
        ok=claimed_now,
        message=message,
        alreadyClaimed=already_claimed,
        redemption=redemption,
    )

###############################################################################

# Checkout

class CheckoutItem(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: int = Field(ge=0, description="Price per unit in cents")
    quantity: int = Field(ge=1, description="Quantity of the item in the cart")


class CheckoutCreate(BaseModel):
    customer_email: str
    shipping_address: str = Field(min_length=1, max_length=500)
    items: list[CheckoutItem]


# Create a checkout session
@app.post("/api/checkout/session")
async def create_checkout_session(checkout: CheckoutCreate, current_user: OptionalCurrentUser) -> dict[str, str]:
    try:
        # if current_user.role == "guest":
        #     raise HTTPException(status_code=403, detail="Guests cannot checkout merchandise.")

        if not checkout.items:
            raise HTTPException(status_code=400, detail="No items provided for checkout")

        account_email = current_user.email.strip() if current_user else ""
        receipt_email = checkout.customer_email.strip()
        if not receipt_email:
            if account_email:
                receipt_email = account_email
            else:
                raise HTTPException(status_code=400, detail="Please provide an email address for your receipt.")

        if not EMAIL_REGEX.match(receipt_email):
            raise HTTPException(status_code=400, detail="Please provide a valid email address for your receipt.")

        shipping_address = checkout.shipping_address.strip()
        if len(shipping_address) < 10:
            raise HTTPException(status_code=400, detail="Please provide a valid shipping address.")

        cleaned_items: list[dict[str, Any]] = []
        line_items: list[dict[str, Any]] = []
        total_amount = 0
        for item in checkout.items:
            name = item.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Item name cannot be empty.")
            quantity = int(item.quantity)
            price = int(item.price)
            total_amount += price * quantity
            cleaned_items.append({
                "name": name,
                "price": price,
                "quantity": quantity,
            })
            line_items.append(
                {
                    "price_data": {
                        "currency": "sgd",
                        "unit_amount": price,
                        "product_data": {"name": name},
                    },
                    "quantity": quantity,
                }
            )

        if total_amount <= 0:
            raise HTTPException(status_code=400, detail="Total amount must be greater than zero")

        # success/cancel pages (simple demo)
        success_url = f"{FRONTEND_URL}/?status=success&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{FRONTEND_URL}/?status=cancel"

        # Create a one-time payment Checkout Session with an inline Price
        # Using price_data.product_data.name allows us to pass the item name directly.
        # customer_email pre-fills or attaches to the created Customer.
        # See: Sessions API / customer_email / price_data docs.
        metadata: dict[str, str] = {}
        if current_user:
            metadata["user_id"] = current_user.id

        session_payload: dict[str, Any] = {
            "mode": "payment",
            "customer_email": receipt_email,
            "line_items": line_items,
            "success_url": success_url,
            "cancel_url": cancel_url,
        }
        if metadata:
            session_payload["metadata"] = metadata

        session = stripe.checkout.Session.create(**session_payload)

        try:
            if current_user and current_user.role != "guest":
                user_id = current_user.id
            else:
                user_id = None
            purchase = await app.state.purchases.create_purchase(
                user_id=user_id,
                user_email=receipt_email,
                shipping_address=shipping_address,
                items=cleaned_items,
                total_amount=total_amount,
                checkout_session_id=session.id,
            )
        except Exception as exc:
            security_logger.error(
                "Failed to record purchase for %s: %s",
                account_email or receipt_email,
                exc,
            )
            raise HTTPException(status_code=500, detail="Unable to record purchase. Please try again later.") from exc

        try:
            await send_purchase_receipt_email(
                receipt_email,
                shipping_address,
                cleaned_items,
                total_amount,
                session.url,
            )
        except Exception as exc:  # pragma: no cover - best effort
            security_logger.error(
                "Failed to send purchase receipt for %s: %s",
                account_email or receipt_email,
                exc,
            )
            # Continue without failing the checkout flow

        security_logger.info(
            "Checkout session created: user_id=%s purchase_id=%s session_id=%s",
            (current_user.id if current_user else "anonymous"),
            purchase.id,
            session.id,
        )

        # You can return session.id and use Stripe.js redirect, or just return session.url and hard-redirect.
        return {"url": session.url}
    except stripe.StripeError as e:
        msg = getattr(e, "user_message", str(e))
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class PurchaseItemResponse(BaseModel):
    name: str
    price: int
    quantity: int


class PurchaseRecordResponse(BaseModel):
    id: str
    userId: str
    userEmail: str
    shippingAddress: str
    totalAmount: int
    status: str
    checkoutSessionId: str | None = None
    createdAt: datetime
    items: list[PurchaseItemResponse]


@app.get("/api/purchases/me", response_model=list[PurchaseRecordResponse])
async def list_my_purchases(current_user: CurrentUser) -> list[PurchaseRecordResponse]:
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests do not have purchase history")

    records: list[PurchaseRecordData] = await app.state.purchases.list_purchases_for_user(current_user.id)
    response: list[PurchaseRecordResponse] = []
    for record in records:
        items = [
            PurchaseItemResponse(name=item.name, price=item.price, quantity=item.quantity)
            for item in record.items
        ]
        response.append(
            PurchaseRecordResponse(
                id=record.id,
                userId=record.userId,
                userEmail=record.userEmail,
                shippingAddress=record.shippingAddress,
                totalAmount=record.totalAmount,
                status=record.status,
                checkoutSessionId=record.checkoutSessionId,
                createdAt=record.createdAt,
                items=items,
            )
        )
    return response


###############################################################################

# File upload

@app.post("/api/upload")
@limiter.limit("10/hour", key_func=authenticated_user_rate_limit_key)
async def upload_file(
    request: Request,
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot upload files")
    content = await file.read()
    await file.close()

    if len(content) > MAX_FILE_SIZE:
        security_logger.warning("File upload rejected due to size from %s", current_user.email)
        raise HTTPException(status_code=413, detail="File size exceeds 10MB limit")

    kind = filetype.guess(content)
    if not kind or kind.mime not in ALLOWED_MIME_TYPES:
        security_logger.warning("Invalid file type upload attempt by %s", current_user.email)
        raise HTTPException(status_code=400, detail="Invalid file type. Only images allowed.")

    try:
        image = Image.open(BytesIO(content))
        width, height = image.size
        image.close()
        if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
            raise HTTPException(
                status_code=400,
                detail=f"Image dimensions exceed {MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}",
            )
    except HTTPException:
        raise
    except Exception:
        security_logger.warning("Corrupted image upload attempt by %s", current_user.email)
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

    safe_filename = sanitize_filename(file.filename or "upload")

    try:
        blob_client = container_client.get_blob_client(safe_filename)
        content_settings = ContentSettings(content_type=kind.mime)
        blob_client.upload_blob(content, overwrite=False, content_settings=content_settings)
    except Exception as exc:
        security_logger.error("File upload failed for %s: %s", current_user.email, exc)
        raise HTTPException(status_code=500, detail="Failed to upload file") from exc

    return {"ok": True, "url": blob_client.url}


###############################################################################

# EVENTS

class EventLinkPayload(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2048)


class NewEvent(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    subHeader: str | None = Field(default=None, max_length=500)
    body: str = Field(min_length=1, max_length=10000)
    url: str | None = Field(default=None, max_length=2048)
    hasRsvp: bool = Field(default=False)
    rsvpRewardPoints: int | None = Field(default=None, ge=0)
    links: list[EventLinkPayload] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class UpdateEvent(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    subHeader: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, min_length=1, max_length=10000)
    url: str | None = Field(default=None, max_length=2048)
    hasRsvp: bool | None = Field(default=None)
    rsvpRewardPoints: int | None = Field(default=None, ge=0)
    links: list[EventLinkPayload] | None = Field(default=None)
    tags: list[str] | None = Field(default=None)


class RSVPRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")


class RSVPScanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    token: str = Field(min_length=1)


class EventLikeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")


class EventRecommendationEntry(BaseModel):
    event: EventData
    score: float = Field(ge=0)
    reasons: list[str] = Field(default_factory=list)


class EventRecommendationsResponse(BaseModel):
    recommendations: list[EventRecommendationEntry]
    usedFallback: bool = False


class RSVPScanResponse(BaseModel):
    ok: bool
    message: str
    alreadyClaimed: bool = False
    rewardPointsAwarded: int = 0
    totalRewardPoints: int
    event: EventData


# Insert NewEvent to event collection
@app.post("/api/post/events", status_code=status.HTTP_201_CREATED, response_model=EventData)
async def create_event(new_event: NewEvent, admin_user: AdminUser) -> EventData:
    _ = admin_user
    reward_points = new_event.rsvpRewardPoints if new_event.hasRsvp else None
    links = [
        {"label": link.label.strip(), "url": link.url.strip()}
        for link in new_event.links
        if link.label.strip() and link.url.strip()
    ]
    tags = normalise_event_tags(new_event.tags, limit=8)
    embedding = await build_event_embedding(
        title=new_event.title,
        sub_header=new_event.subHeader,
        body=new_event.body,
        tags=tags,
    )
    event = await app.state.events.create_event(
        title=new_event.title,
        sub_header=new_event.subHeader,
        body=new_event.body,
        url=new_event.url,
        rsvp_enabled=new_event.hasRsvp,
        rsvp_reward_points=reward_points,
        links=links,
        tags=tags,
        embedding=embedding,
    )
    event = await ensure_event_rsvp_qr(event)
    try:
        users = await app.state.user.list_users_excluding_roles(["guest"])
        recipient_ids = [user.id for user in users if user.id]
        if recipient_ids:
            await notify_users(
                recipient_ids,
                notification_type=NotificationType.EVENT_CREATED,
                title="New event published",
                body=f"{new_event.title} is now live on MUSEngage.",
                url=f"{FRONTEND_URL}/events",
            )
    except Exception as exc:
        logger.warning("Failed to send event notifications: %s", exc)
    return event

@app.get("/api/events", response_model=list[EventData])
async def list_events() -> list[EventData]:
    return await app.state.events.list_events()

@app.get("/api/events/{event_id}", response_model=EventData)
async def get_event(event_id: str) -> EventData:
    event = await app.state.events.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@app.patch("/api/events/{event_id}", response_model=EventData)
async def patch_event(event_id: str, update: UpdateEvent, admin_user: AdminUser) -> EventData:
    _ = admin_user
    updates = update.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No event fields provided")
    existing_event = await app.state.events.get_event(event_id)
    if not existing_event:
        raise HTTPException(status_code=404, detail="Event not found")
    kwargs: dict[str, str | None] = {}
    rsvp_enabled: bool | None = None
    rsvp_reward_points: int | None = None
    links_payload = updates.pop("links", None)
    tags_payload = updates.pop("tags", None)
    should_refresh_embedding = False
    if "title" in updates:
        title = (updates["title"] or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Event title cannot be empty")
        kwargs["title"] = title
        should_refresh_embedding = True
    if "subHeader" in updates:
        sub_header = updates["subHeader"]
        kwargs["sub_header"] = sub_header.strip() if sub_header else None
        should_refresh_embedding = True
    if "body" in updates:
        body = (updates["body"] or "").strip()
        if not body:
            raise HTTPException(status_code=400, detail="Event body cannot be empty")
        kwargs["body"] = body
        should_refresh_embedding = True
    if "url" in updates:
        url = updates["url"]
        kwargs["url"] = url.strip() if url else None
    if "hasRsvp" in updates:
        rsvp_enabled = updates["hasRsvp"]
    if "rsvpRewardPoints" in updates:
        reward_points = updates["rsvpRewardPoints"]
        rsvp_reward_points = reward_points
    links: list[dict[str, str]] | None = None
    if links_payload is not None:
        cleaned_links: list[dict[str, str]] = []
        for link in links_payload:
            if isinstance(link, dict):
                label = link.get("label", "").strip()
                url_value = link.get("url", "").strip()
            else:
                label = link.label.strip()
                url_value = link.url.strip()

            if label and url_value:
                cleaned_links.append({"label": label, "url": url_value})
        links = cleaned_links
    if tags_payload is not None:
        tags = normalise_event_tags(tags_payload, limit=8)
        kwargs["tags"] = tags
        should_refresh_embedding = True

    event = await app.state.events.update_event(
        event_id,
        **kwargs,
        rsvp_enabled=rsvp_enabled,
        rsvp_reward_points=rsvp_reward_points,
        links=links,
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event = await ensure_event_rsvp_qr(event, previous=existing_event)
    if should_refresh_embedding:
        refreshed_embedding = await build_event_embedding(
            title=event.title,
            sub_header=event.sub_header,
            body=event.body,
            tags=event.tags,
        )
        if refreshed_embedding is not None:
            await app.state.events.update_event_embedding(event.id, embedding=refreshed_embedding)
    return event

@app.delete("/api/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, admin_user: AdminUser):
    _ = admin_user
    deleted = await app.state.events.delete_event(event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found")


@app.post("/api/events/{event_id}/rsvp", response_model=EventData)
async def rsvp_event(
    event_id: str,
    current_user: CurrentUser,
    _payload: RSVPRequest | None = None,
) -> EventData:
    user = current_user
    event = await app.state.events.add_rsvp(
        event_id,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
    )
    if not event:
        existing = await app.state.events.get_event(event_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")
        raise HTTPException(status_code=400, detail="RSVP is not available for this event")
    return event


@app.post("/api/events/{event_id}/like", response_model=UserDataOut)
async def like_event(
    event_id: str,
    current_user: CurrentUser,
    _payload: EventLikeRequest | None = None,
) -> UserDataOut:
    user = current_user
    event = await app.state.events.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    updated_user = await app.state.user.add_liked_event(user.id, event_id=event_id)
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to like event")
    return updated_user


@app.delete("/api/events/{event_id}/like", response_model=UserDataOut)
async def unlike_event(
    event_id: str,
    current_user: CurrentUser,
    _payload: EventLikeRequest | None = Body(default=None),
) -> UserDataOut:
    user = current_user
    event = await app.state.events.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    updated_user = await app.state.user.remove_liked_event(user.id, event_id=event_id)
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to unlike event")
    return updated_user


@app.post("/api/rsvp/verify", response_model=RSVPScanResponse)
async def verify_rsvp_token(
    payload: RSVPScanRequest, current_user: CurrentUser
) -> RSVPScanResponse:
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="RSVP token is required")

    user = current_user
    if user.role not in {"student", "admin"}:
        raise HTTPException(status_code=403, detail="Only students and admins can verify RSVPs")

    result = await app.state.events.redeem_rsvp_reward(rsvp_key=token, user_id=user.id)
    if not result:
        raise HTTPException(status_code=404, detail="Invalid RSVP token")

    event, status = result
    if status == "attendee_missing":
        raise HTTPException(
            status_code=400,
            detail="You must RSVP to this event before claiming reward points.",
        )

    if status == "already_redeemed":
        return RSVPScanResponse(
            ok=False,
            message="Reward points for this event have already been added to your profile.",
            alreadyClaimed=True,
            rewardPointsAwarded=0,
            totalRewardPoints=user.rewardPoints,
            event=event,
        )

    reward_points = 0
    if event.rsvp and event.rsvp.reward_points is not None:
        reward_points = int(event.rsvp.reward_points)

    if reward_points <= 0:
        return RSVPScanResponse(
            ok=True,
            message="Attendance recorded. This event does not award reward points.",
            alreadyClaimed=False,
            rewardPointsAwarded=0,
            totalRewardPoints=user.rewardPoints,
            event=event,
        )

    new_total = user.rewardPoints + reward_points
    updated_user = await app.state.user.update_user(
        user.id,
        new_reward_points=new_total,
    )
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to update reward points")

    return RSVPScanResponse(
        ok=True,
        message=f"{reward_points} reward points added for {event.title}.",
        alreadyClaimed=False,
        rewardPointsAwarded=reward_points,
        totalRewardPoints=updated_user.rewardPoints,
        event=event,
    )


@app.get("/api/users/{user_id}/rsvps", response_model=list[EventData])
async def list_user_rsvps(
    user_id: str, current_user: CurrentUser
) -> list[EventData]:
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorised to view RSVPs")
    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await app.state.events.list_rsvp_events_for_user(user_id)


@app.get(
    "/api/users/{user_id}/recommendations/events",
    response_model=EventRecommendationsResponse,
)
async def recommend_events(
    user_id: str,
    current_user: CurrentUser,
    limit: RecommendationLimit = 4,
) -> EventRecommendationsResponse:
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorised to view recommendations")
    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    events_with_embeddings = await app.state.events.list_events_with_embeddings()
    if not events_with_embeddings:
        return EventRecommendationsResponse(recommendations=[], usedFallback=True)

    liked_ids = [event_id for event_id in user.likedEvents if event_id]
    liked_set = set(liked_ids)
    tag_counter: Counter[str] = Counter()
    preference_vectors: list[list[float]] = []

    for event, embedding in events_with_embeddings:
        if event.id not in liked_set:
            continue
        tag_counter.update(tag.lower() for tag in event.tags)
        ensured = await ensure_event_embedding(event, embedding)
        if ensured is not None:
            preference_vectors.append(ensured)

    preference_vector: list[float] | None = None
    if preference_vectors:
        reference_length = len(preference_vectors[0])
        totals = [0.0] * reference_length
        count = 0
        for vector in preference_vectors:
            if len(vector) != reference_length:
                continue
            totals = [total + value for total, value in zip(totals, vector)]
            count += 1
        if count:
            preference_vector = [value / count for value in totals]

    total_tag_weight = sum(tag_counter.values())

    used_fallback = False

    if not liked_set or (preference_vector is None and total_tag_weight == 0):
        used_fallback = True
        fallback_entries: list[EventRecommendationEntry] = []
        for event, _ in events_with_embeddings:
            if event.id in liked_set:
                continue
            score = compute_recency_boost(event.created_at)
            reasons = build_reasons(
                event,
                tag_counter,
                similarity=0.0,
                tag_overlap=0.0,
                fallback=True,
            )
            fallback_entries.append(
                EventRecommendationEntry(event=event, score=score, reasons=reasons)
            )
        fallback_entries.sort(key=lambda entry: entry.score, reverse=True)
        return EventRecommendationsResponse(
            recommendations=fallback_entries[:limit],
            usedFallback=True,
        )

    recommendations: list[EventRecommendationEntry] = []
    for event, embedding in events_with_embeddings:
        if event.id in liked_set:
            continue

        similarity = 0.0
        if preference_vector is not None:
            ensured = await ensure_event_embedding(event, embedding)
            if ensured is not None and len(ensured) == len(preference_vector):
                similarity = cosine_similarity(preference_vector, ensured)

        overlap_ratio = 0.0
        if total_tag_weight > 0 and event.tags:
            overlap_weight = sum(tag_counter.get(tag.lower(), 0) for tag in event.tags)
            if overlap_weight:
                overlap_ratio = overlap_weight / total_tag_weight

        recency = compute_recency_boost(event.created_at)
        score = max(0.0, (similarity * 0.6) + (overlap_ratio * 0.3) + (recency * 0.1))
        reasons = build_reasons(
            event,
            tag_counter,
            similarity=similarity,
            tag_overlap=overlap_ratio,
            fallback=False,
        )
        recommendations.append(
            EventRecommendationEntry(event=event, score=score, reasons=reasons)
        )

    recommendations.sort(key=lambda entry: entry.score, reverse=True)
    top_recommendations = recommendations[:limit]

    if len(top_recommendations) < limit:
        added_ids = {entry.event.id for entry in top_recommendations}
        fallback_candidates: list[EventRecommendationEntry] = []
        for event, _ in events_with_embeddings:
            if event.id in liked_set or event.id in added_ids:
                continue
            score = compute_recency_boost(event.created_at)
            reasons = build_reasons(
                event,
                tag_counter,
                similarity=0.0,
                tag_overlap=0.0,
                fallback=True,
            )
            fallback_candidates.append(
                EventRecommendationEntry(event=event, score=score, reasons=reasons)
            )
        fallback_candidates.sort(key=lambda entry: entry.score, reverse=True)
        for candidate in fallback_candidates:
            if len(top_recommendations) >= limit:
                break
            top_recommendations.append(candidate)
            used_fallback = True

    return EventRecommendationsResponse(
        recommendations=top_recommendations,
        usedFallback=used_fallback,
    )

###############################################################################

# Authentication and Validation

class ValidateUser(BaseModel):
    email: str

class Credentials(BaseModel):
    email: str
    password: str

class OTPRequest(BaseModel):
    email: str

class OTPVerify(BaseModel):
    email: str
    code: str

class OTPVerifyResponse(BaseModel):
    ok: bool
    user: UserDataOut | None = None


class VerificationTokenPayload(BaseModel):
    token: str = Field(min_length=1)


class ResendVerificationPayload(BaseModel):
    email: str = Field(min_length=1)

@app.get("/api/csrf-token")
async def get_csrf_token(csrf_protect: CsrfProtect = Depends()) -> JSONResponse:
    token, signed_token = csrf_protect.generate_csrf_tokens()
    # Security note: The unsigned token is returned in JSON so the frontend can send it in headers
    # The signed token is stored in an HttpOnly cookie for verification
    # This implements the double-submit cookie pattern for CSRF protection
    response = JSONResponse(content={"csrfToken": token})
    csrf_protect.set_csrf_cookie(signed_token, response)
    return response

@app.post("/api/otp/request", status_code=status.HTTP_200_OK, response_model=bool)
@limiter.limit("3/5minutes")
async def request_otp(request: Request, req: OTPRequest) -> bool:
    email = req.email.strip().lower()
    now = datetime.now(timezone.utc)
    existing = await app.state.otp.otps.find_one(
        {"email": email, "expires_at": {"$gt": now + timedelta(minutes=1)}},
        projection={"_id": 1},
    )
    if existing:
        return True

    await app.state.otp.create_otp(email, ttl_minutes=5)
    security_logger.info("OTP requested for %s", email)
    return True


# Validate Authentication OTP 
@app.post("/api/otp/verify", status_code=status.HTTP_200_OK, response_model=OTPVerifyResponse)
@limiter.limit("5/15minutes")
async def verify_otp(request: Request, req: OTPVerify, response: Response) -> OTPVerifyResponse:
    email = req.email.strip().lower()
    is_locked, locked_until = await app.state.login_attempts.is_locked(email)
    if is_locked and locked_until:
        raise HTTPException(
            status_code=423,
            detail=f"Account is locked due to too many failed attempts. Try again after {locked_until.isoformat()}",
        )

    ok = await app.state.otp.verify_otp(email, req.code.strip())
    if not ok:
        locked, locked_until = await app.state.login_attempts.record_failed_attempt(email)
        if locked and locked_until:
            await send_account_lock_email(email, locked_until)
            raise HTTPException(
                status_code=423,
                detail=f"Account locked due to too many failed attempts. Locked until {locked_until.isoformat()}",
            )
        return OTPVerifyResponse(ok=False, user=None)

    await app.state.login_attempts.reset_attempts(email)

    user = await app.state.user.get_user_by_email(email)
    if user is None:
        guest_user = UserDataOut(
            id="guest",
            email=email,
            name="Guest",
            role="guest",
            rewardPoints=0,
            likedEvents=[],
            profileImageUrl=None,
        )
        _set_guest_access_cookie(response, guest_user)
        return OTPVerifyResponse(ok=True, user=guest_user)

    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address before logging in. Check your inbox for the verification link.",
        )

    await _set_auth_cookies(response, user)
    return OTPVerifyResponse(ok=True, user=user)


@app.post("/api/auth/verify-email")
@limiter.limit("10/hour")
async def verify_email(request: Request, payload: VerificationTokenPayload) -> dict[str, str]:
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Verification token required")

    record = await app.state.user.get_user_doc_by_verification_token(token)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    expires_at = record.get("verification_token_expires")
    if expires_at:
        # Ensure expires_at is timezone-aware for comparison
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Verification token has expired")

    await app.state.user.verify_email(record["_id"])
    return {"message": "Email verified successfully. You can now log in."}

@app.post("/api/auth/resend-verification")
@limiter.limit("3/hour")
async def resend_verification(request: Request, payload: ResendVerificationPayload) -> dict[str, str]:
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    user = await app.state.user.get_user_by_email(email)
    if user is None:
        return {"message": "If your email is registered, you will receive a verification email."}

    if user.email_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    verification_token = secrets.token_urlsafe(32)
    token_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    await app.state.user.update_verification_token(user.id, verification_token, token_expires)

    try:
        await send_verification_email(email, verification_token)
    except Exception as exc:  # pragma: no cover
        security_logger.error("Verification email resend failed for %s: %s", email, exc)

    return {"message": "Verification email sent. Please check your inbox."}


@app.get("/api/auth/me", response_model=UserDataOut)
async def get_authenticated_user(current_user: CurrentUser) -> UserDataOut:
    return current_user


@app.post("/api/refresh")
async def refresh_access_token(request: Request, response: Response) -> dict[str, bool]:
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    record = await _get_refresh_record(refresh_token)
    if not record:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await app.state.user.get_user(record["user_id"])
    if not user:
        await _pop_refresh_token(refresh_token)
        raise HTTPException(status_code=401, detail="User not found")

    await _pop_refresh_token(refresh_token)
    await _set_auth_cookies(response, user)
    return {"ok": True}


@app.post("/api/logout")
async def logout(request: Request, response: Response) -> dict[str, bool]:
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    if refresh_token:
        await _pop_refresh_token(refresh_token)
    _clear_auth_cookies(response)
    return {"ok": True}

# Validate Email - Check for Existing User
@app.post("/api/users/validate", status_code=status.HTTP_200_OK,)
@limiter.limit("20/hour")
async def validate_user(request: Request, req: ValidateUser) -> bool:
    return await app.state.user.validate_user(req.email)

# Validate Email and Password - For Login Page
@app.post("/api/users/check_credentials", response_model=bool, status_code=status.HTTP_200_OK)
@limiter.limit("5/15minutes")
async def check_credentials(request: Request, user: Credentials) -> bool:
    email = user.email.strip().lower()
    is_locked, locked_until = await app.state.login_attempts.is_locked(email)
    if is_locked and locked_until:
        raise HTTPException(
            status_code=423,
            detail=f"Account is locked due to too many failed attempts. Try again after {locked_until.isoformat()}",
        )

    account = await app.state.user.get_user_by_email(email)
    if account is None:
        await app.state.login_attempts.record_failed_attempt(email)
        return False

    if not account.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address before logging in.",
        )

    is_valid = await app.state.user.validate_credentials(email, user.password)
    if is_valid:
        await app.state.login_attempts.reset_attempts(email)
        return True

    locked, locked_until = await app.state.login_attempts.record_failed_attempt(email)
    if locked and locked_until:
        await send_account_lock_email(email, locked_until)
        raise HTTPException(
            status_code=423,
            detail=f"Account locked due to too many failed attempts. Locked until {locked_until.isoformat()}",
        )
    return False




###############################################################################



# USERS


class NewUser(BaseModel):
    email: str
    name: str
    password: str
    role: ValidRole = Field(default="student")

class UpdateUser(BaseModel):
    name: str | None = Field(default=None)
    role: ValidRole | None = Field(default=None)
    rewardPoints: int | None = Field(default=None, ge=0)
    profileImageUrl: str | None = Field(default=None)


class DeleteAccountPayload(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    reason: str = Field(min_length=5, max_length=2000)


class ChangePasswordPayload(BaseModel):
    currentPassword: str = Field(min_length=1)
    newPassword: str = Field(min_length=1)


# Create
@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/hour")
async def register_user(request: Request, new_user: NewUser) -> dict[str, str]:
    name = new_user.name.strip()
    email = new_user.email.strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if not email:
        raise HTTPException(status_code=400, detail="Email cannot be empty")
    if not STUDENT_EMAIL_PATTERN.match(email):
        raise HTTPException(
            status_code=400,
            detail="Only Murdoch University student emails are allowed (format: 12345678@student.murdoch.edu.au)",
        )

    is_valid, error_message = validate_password(new_user.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_message or "Invalid password")

    existing_user = await app.state.user.get_user_by_email(email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    verification_token = secrets.token_urlsafe(32)
    token_expires = datetime.now(timezone.utc) + timedelta(hours=24)

    try:
        await app.state.user.create_user(
            email=email,
            name=name,
            password=new_user.password,
            role="student",
            email_verified=False,
            verification_token=verification_token,
            verification_token_expires=token_expires,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        await send_verification_email(email, verification_token)
    except Exception as exc:  # pragma: no cover - best effort
        security_logger.error("Verification email dispatch failed for %s: %s", email, exc)

    return {
        "message": "Account created successfully. Please check your email to verify your account.",
    }


@app.get("/api/users/me/export")
async def export_my_data(current_user: CurrentUser) -> Response:
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guest accounts do not support data export")

    posts = await app.state.posts.list_posts_by_author(current_user.id)
    feedback_entries = await app.state.feedback.list_feedback_for_user(current_user.id)
    rsvp_events = await app.state.events.list_rsvp_events_for_user(current_user.id)

    export_payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "user": current_user.model_dump(mode="json", by_alias=True),
        "posts": [post.model_dump(mode="json", by_alias=True) for post in posts],
        "feedback": [entry.model_dump(mode="json", by_alias=True) for entry in feedback_entries],
        "events": [event.model_dump(mode="json", by_alias=True) for event in rsvp_events],
    }

    content = json.dumps(export_payload, indent=2)
    filename = f"musengage-data-export-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    return Response(content=content, media_type="application/json", headers=headers)


@app.delete("/api/users/me")
async def delete_my_account(payload: DeleteAccountPayload, current_user: CurrentUser) -> JSONResponse:
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guest accounts cannot be deleted")

    confirmed_email = payload.email.strip().lower()
    if confirmed_email != current_user.email.lower():
        raise HTTPException(status_code=400, detail="Email confirmation does not match the account email")

    reason = payload.reason.strip()
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Please provide a brief reason for deleting your account")

    await app.state.posts.anonymize_user_posts(current_user.id)
    await app.state.push_subscriptions.remove_all_for_user(current_user.id)
    await app.state.notifications.clear_notifications(current_user.id)

    deleted = await app.state.user.delete_user(current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")

    security_logger.info("Account deleted: user_id=%s reason=%s", current_user.id, reason)

    response = JSONResponse({"message": "Account deleted"}, status_code=status.HTTP_200_OK)
    response.delete_cookie(ACCESS_TOKEN_COOKIE_NAME, domain=COOKIE_DOMAIN)
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, domain=COOKIE_DOMAIN)
    return response


@app.post("/api/users/me/password")
@limiter.limit("5/15minutes")
async def change_my_password(
    request: Request, payload: ChangePasswordPayload, current_user: CurrentUser
) -> dict[str, str]:
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests do not have passwords to update")

    try:
        updated = await app.state.user.change_password(
            current_user.id,
            current_password=payload.currentPassword,
            new_password=payload.newPassword,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not updated:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    return {"message": "Password updated successfully."}


@app.post("/api/users/", status_code=status.HTTP_201_CREATED,)
async def create_user(new_user: NewUser, _current_user: AdminUser) -> UserDataIn:
    name = new_user.name.strip()
    email = new_user.email.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if not email:
        raise HTTPException(status_code=400, detail="Email cannot be empty")
    return await app.state.user.create_user(
        email=email,
        name=name,
        password=new_user.password,
        role=new_user.role,
    )

# Read 
@app.get("/api/users/", response_model=list[UserDataOut])
async def get_users(_current_user: AdminUser) -> list[UserDataOut]:
    return await app.state.user.list_users()

@app.get("/api/users/{user_id}", response_model=UserDataOut)
async def get_user_detail(user_id: str, current_user: CurrentUser) -> UserDataOut:
    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return user

# Update
@app.patch("/api/users/{user_id}")
async def change_user(user_id:str, update: UpdateUser, current_user: CurrentUser) -> UserDataOut:
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    updates = update.dict(exclude_unset=True)
    new_name: str | None = None
    new_role: ValidRole | None = None
    new_reward_points: int | None = None
    new_profile_image_url: str | None | Literal[False] = None
    if "name" in updates:
        name_value = updates["name"]
        if name_value is None:
            raise HTTPException(status_code=400, detail="Name cannot be null")
        name_value = name_value.strip()
        if not name_value:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        new_name = name_value
    if "role" in updates:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can change roles")
        new_role = updates["role"]
    if "rewardPoints" in updates:
        reward_value = updates["rewardPoints"]
        if reward_value is None:
            raise HTTPException(status_code=400, detail="Reward points cannot be null")
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can change reward points")
        new_reward_points = reward_value
    if "profileImageUrl" in updates:
        value = updates["profileImageUrl"]
        if value is None:
            new_profile_image_url = False
        else:
            trimmed = value.strip()
            new_profile_image_url = trimmed or False

    updated = await app.state.user.update_user(
        user_id,
        new_name=new_name,
        new_role=new_role,
        new_reward_points=new_reward_points,
        new_profile_image_url=new_profile_image_url,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated

# Delete
@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: str, _current_user: AdminUser):
    deleted = await app.state.user.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")


###############################################################################

# Feedback


class NewFeedback(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str = Field(min_length=1, max_length=4000)
    category: str | None = Field(default=None, max_length=200)


class UpdateFeedbackStatus(BaseModel):
    status: FeedbackStatus


@app.get("/api/feedback/statuses", response_model=list[str])
async def list_feedback_statuses() -> list[str]:
    return [status.value for status in FeedbackStatus]


@app.post("/api/feedback", status_code=status.HTTP_201_CREATED, response_model=FeedbackData)
@limiter.limit("10/hour")
async def create_feedback_entry(request: Request, payload: NewFeedback, current_user: CurrentUser) -> FeedbackData:
    user = current_user
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Feedback message cannot be empty")

    category = payload.category.strip() if payload.category else None
    feedback = await app.state.feedback.create_feedback(
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        message=message,
        category=category,
    )
    try:
        admins = await app.state.user.list_users_with_roles(["admin"])
        admin_ids = [admin.id for admin in admins if admin.id]
        if admin_ids:
            await notify_users(
                admin_ids,
                notification_type=NotificationType.FEEDBACK_SUBMITTED,
                title="New feedback submitted",
                body=f"{user.name} shared new feedback.",
                url=f"{FRONTEND_URL}/admin",
            )
    except Exception as exc:
        logger.warning("Failed to send feedback notifications: %s", exc)
    return feedback


@app.get("/api/feedback", response_model=list[FeedbackData])
async def list_feedback_entries(_current_user: AdminUser) -> list[FeedbackData]:
    return await app.state.feedback.list_feedback()


@app.get("/api/users/{user_id}/feedback", response_model=list[FeedbackData])
async def list_user_feedback(
    user_id: str, current_user: CurrentUser
) -> list[FeedbackData]:
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorised to view feedback")
    user = await app.state.user.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await app.state.feedback.list_feedback_for_user(user_id)


@app.patch("/api/feedback/{feedback_id}", response_model=FeedbackData)
async def update_feedback_status(
    feedback_id: str, payload: UpdateFeedbackStatus, _current_user: AdminUser
) -> FeedbackData:
    updated = await app.state.feedback.update_status(feedback_id, payload.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return updated


@app.delete("/api/feedback/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feedback_entry(feedback_id: str, _current_user: AdminUser) -> None:
    deleted = await app.state.feedback.delete_feedback(feedback_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Feedback not found")


###############################################################################

# Community Posts


class NewPost(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=500)
    flair: str | None = Field(default=None, max_length=120)
    imageUrl: str | None = Field(default=None, max_length=2048)


class NewComment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    content: str = Field(min_length=1, max_length=300)


class UpdatePost(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    content: str | None = Field(default=None, min_length=1, max_length=500)
    flair: str | None = Field(default=None, max_length=120)
    imageUrl: str | None = Field(default=None, max_length=2048)


class ModerationDecisionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    note: str | None = Field(default=None, max_length=500)


@app.get("/api/posts", response_model=list[PostData])
async def list_posts() -> list[PostData]:
    return await app.state.posts.list_posts()


@app.post("/api/posts", status_code=status.HTTP_201_CREATED, response_model=PostSubmissionResponse)
async def create_post(payload: NewPost, current_user: CurrentUser) -> PostSubmissionResponse:
    user = current_user
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Post title cannot be empty")
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Post content cannot be empty")
    flair = payload.flair.strip() if payload.flair else None
    image_url = payload.imageUrl.strip() if payload.imageUrl else None
    moderation_payload = {
        "title": title,
        "content": content,
        "flair": flair,
        "imageUrl": image_url,
        "author": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        },
    }
    try:
        raw_response = await asyncio.to_thread(
            moderator_ai_response,
            json.dumps(moderation_payload, ensure_ascii=False),
        )
        moderation_data = json.loads(raw_response)
    except Exception as exc:
        logger.warning("Community post moderation failed: %s", exc)
        moderation_data = {
            "status": "rejected",
            "reason": "Automatic moderation unavailable. Needs manual review.",
            "categories": ["system_error"],
        }

    status_value = str(moderation_data.get("status", "")).lower()
    reason_value = str(moderation_data.get("reason", "")).strip()
    categories_raw = moderation_data.get("categories", [])
    if not isinstance(categories_raw, list):
        categories_raw = []
    categories = [str(item).strip() for item in categories_raw if str(item).strip()]

    if status_value == PostSubmissionStatus.APPROVED.value:
        post = await app.state.posts.create_post(
            author=user,
            title=title,
            content=content,
            flair=flair,
            image_url=image_url,
        )
        return PostSubmissionResponse(status=PostSubmissionStatus.APPROVED, post=post)

    rejection_reason = reason_value or "Flagged for manual review."
    record = await app.state.post_moderation.create_rejected_submission(
        author=user,
        title=title,
        content=content,
        flair=flair,
        image_url=image_url,
        reason=rejection_reason,
        categories=categories,
    )
    try:
        admins = await app.state.user.list_users_with_roles(["admin"])
        admin_ids = [admin.id for admin in admins if admin.id]
        if admin_ids:
            await notify_users(
                admin_ids,
                notification_type=NotificationType.POST_REJECTED,
                title="Community post needs review",
                body=f"{user.name}'s post was flagged by the AI moderator.",
                url=f"{FRONTEND_URL}/admin",
            )
    except Exception as exc:
        logger.warning("Failed to send moderation notifications: %s", exc)
    summary = PostModerationSummary.from_record(record)
    response_body = PostSubmissionResponse(
        status=PostSubmissionStatus.REJECTED,
        moderation=summary,
    )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=response_body.model_dump(mode="json"),
    )


@app.post("/api/posts/{post_id}/comments", response_model=PostData)
async def add_comment(post_id: str, payload: NewComment, current_user: CurrentUser) -> PostData:
    user = current_user
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    updated = await app.state.posts.add_comment(post_id, author=user, content=content)
    if not updated:
        raise HTTPException(status_code=404, detail="Post not found")
    return updated


@app.post("/api/posts/{post_id}/upvotes", response_model=PostData)
async def add_post_upvote(post_id: str, current_user: CurrentUser) -> PostData:
    user = current_user
    updated = await app.state.posts.add_upvote(post_id, user=user)
    if not updated:
        raise HTTPException(status_code=404, detail="Post not found")
    return updated


@app.delete("/api/posts/{post_id}/upvotes", response_model=PostData)
async def remove_post_upvote(post_id: str, current_user: CurrentUser) -> PostData:
    user = current_user
    updated = await app.state.posts.remove_upvote(post_id, user=user)
    if not updated:
        raise HTTPException(status_code=404, detail="Post not found")
    return updated

@app.get("/api/posts/{post_id}", response_model=PostData)
async def get_post(post_id: str) -> PostData:
    post = await app.state.posts.get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post

@app.patch("/api/posts/{post_id}", response_model=PostData)
async def patch_post(post_id: str, payload: UpdatePost, admin_user: AdminUser) -> PostData:
    _ = admin_user
    updates = payload.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No post fields provided")

    update_fields: dict[str, str | None] = {}

    if "title" in updates:
        title = (updates["title"] or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Post title cannot be empty")
        update_fields["title"] = title

    if "content" in updates:
        content = (updates["content"] or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="Post content cannot be empty")
        update_fields["content"] = content

    if "flair" in updates:
        flair_value = updates["flair"]
        if flair_value:
            update_fields["flair"] = flair_value.strip()
        else:
            update_fields["flair"] = None

    if "imageUrl" in updates:
        image_value = updates["imageUrl"]
        if image_value:
            image_value = image_value.strip()
            update_fields["image_url"] = image_value if image_value else None
        else:
            update_fields["image_url"] = None

    if not update_fields:
        raise HTTPException(status_code=400, detail="No post fields provided")

    updated = await app.state.posts.update_post(post_id, updates=update_fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Post not found")
    return updated

@app.delete("/api/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: str, admin_user: AdminUser):
    _ = admin_user
    deleted = await app.state.posts.delete_post(post_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Post not found")

@app.delete("/api/posts/{post_id}/comments/{comment_id}", response_model=PostData)
async def delete_comment(post_id: str, comment_id: str, admin_user: AdminUser) -> PostData:
    _ = admin_user
    updated = await app.state.posts.delete_comment(post_id, comment_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Post or comment not found")
    return updated


@app.get(
    "/api/moderation/community-posts/rejected",
    response_model=list[PostModerationRecord],
)
async def list_rejected_posts_for_review(
    _admin_user: AdminUser,
) -> list[PostModerationRecord]:
    return await app.state.post_moderation.list_pending()


@app.post(
    "/api/moderation/community-posts/{record_id}/approve",
    response_model=PostData,
)
async def approve_rejected_post(
    record_id: str,
    payload: ModerationDecisionPayload,
    admin_user: AdminUser,
) -> PostData:
    record = await app.state.post_moderation.get_record(record_id)
    if not record or record.status != PostModerationStatus.PENDING_REVIEW:
        raise HTTPException(status_code=404, detail="Moderation record not found")

    author = await app.state.user.get_user(record.authorId)
    if not author:
        raise HTTPException(status_code=404, detail="Author not found")

    note = payload.note.strip() if payload.note and payload.note.strip() else None
    post = await app.state.posts.create_post(
        author=author,
        title=record.title,
        content=record.content,
        flair=record.flair,
        image_url=record.imageUrl,
        created_at=record.submittedAt,
    )

    updated = await app.state.post_moderation.mark_approved(
        record_id,
        admin_id=admin_user.id,
        admin_name=admin_user.name,
        post_id=post.id,
        note=note,
    )
    if not updated:
        await app.state.posts.delete_post(post.id)
        raise HTTPException(status_code=409, detail="Moderation record is no longer pending")

    return post


@app.post(
    "/api/moderation/community-posts/{record_id}/reject",
    response_model=PostModerationRecord,
)
async def reject_rejected_post(
    record_id: str,
    payload: ModerationDecisionPayload,
    admin_user: AdminUser,
) -> PostModerationRecord:
    record = await app.state.post_moderation.get_record(record_id)
    if not record or record.status != PostModerationStatus.PENDING_REVIEW:
        raise HTTPException(status_code=404, detail="Moderation record not found")

    note = payload.note.strip() if payload.note and payload.note.strip() else None
    updated = await app.state.post_moderation.mark_rejected(
        record_id,
        admin_id=admin_user.id,
        admin_name=admin_user.name,
        note=note,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Moderation record is no longer pending")
    return updated


###############################################################################

# Polls


class NewPoll(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_items=2)
    imageUrl: str | None = Field(default=None, max_length=2048)
    rewardPoints: int = Field(default=0, ge=0)


class UpdatePoll(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=500)
    options: list[str] | None = Field(default=None, min_items=2)
    imageUrl: str | None = Field(default=None, max_length=2048)
    rewardPoints: int | None = Field(default=None, ge=0)


class PollVote(BaseModel):
    participantId: str
    optionIndex: int


@app.post("/api/polls", status_code=status.HTTP_201_CREATED, response_model=PollData)
async def create_poll(payload: NewPoll, admin_user: AdminUser) -> PollData:
    _ = admin_user
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Poll question cannot be empty")
    options = [option.strip() for option in payload.options if option.strip()]
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="Poll requires at least two options")
    image_url = payload.imageUrl.strip() if payload.imageUrl else None
    return await app.state.polls.create_poll(
        question=question,
        options=options,
        image_url=image_url,
        reward_points=payload.rewardPoints,
    )


@app.get("/api/polls", response_model=list[PollData])
async def list_polls(participantId: str | None = None) -> list[PollData]:
    return await app.state.polls.list_polls(participant_id=participantId)


@app.get("/api/polls/{poll_id}", response_model=PollData)
async def get_poll(poll_id: str, participantId: str | None = None) -> PollData:
    poll = await app.state.polls.get_poll(poll_id, participant_id=participantId)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    return poll


@app.patch("/api/polls/{poll_id}", response_model=PollData)
async def update_poll(poll_id: str, payload: UpdatePoll, admin_user: AdminUser) -> PollData:
    _ = admin_user
    updates = payload.dict(exclude_unset=True)
    kwargs: dict[str, object] = {}
    if "question" in updates:
        question_value = (updates["question"] or "").strip()
        if not question_value:
            raise HTTPException(status_code=400, detail="Poll question cannot be empty")
        kwargs["question"] = question_value
    if "options" in updates:
        options_list = [option.strip() for option in updates["options"] or [] if option.strip()]
        if len(options_list) < 2:
            raise HTTPException(status_code=400, detail="Poll requires at least two options")
        kwargs["options"] = options_list
    if "imageUrl" in updates:
        image_value = updates["imageUrl"]
        kwargs["image_url"] = image_value.strip() if image_value else None
    if "rewardPoints" in updates:
        kwargs["reward_points"] = int(updates["rewardPoints"] or 0)
    poll = await app.state.polls.update_poll(poll_id, **kwargs)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found or already finalised")
    return poll


@app.delete("/api/polls/{poll_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poll(poll_id: str, admin_user: AdminUser):
    _ = admin_user
    deleted = await app.state.polls.delete_poll(poll_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Poll not found")


@app.post("/api/polls/{poll_id}/vote", response_model=PollData)
async def vote_on_poll(poll_id: str, payload: PollVote) -> PollData:
    try:
        updated = await app.state.polls.cast_vote(
            poll_id,
            participant_id=payload.participantId,
            option_index=payload.optionIndex,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Poll not found or already finalised")
    return updated


@app.post("/api/polls/{poll_id}/finalize", response_model=PollData)
async def finalize_poll(poll_id: str, admin_user: AdminUser) -> PollData:
    _ = admin_user
    poll = await app.state.polls.finalize_poll(poll_id)
    if not poll:
        poll = await app.state.polls.get_poll(poll_id)
        if not poll:
            raise HTTPException(status_code=404, detail="Poll not found")
        if not poll.isFinalized:
            raise HTTPException(status_code=409, detail="Poll could not be finalised")

    if poll.rewardPoints > 0 and not poll.rewardPointsAwarded:
        try:
            participant_ids = await app.state.polls.get_poll_participant_ids(poll_id)
            for participant_id in participant_ids:
                if not participant_id:
                    continue
                try:
                    updated_user = await app.state.user.adjust_reward_points(
                        participant_id,
                        poll.rewardPoints,
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to update reward points for poll participant %s: %s",
                        participant_id,
                        exc,
                    )
                    continue
                if not updated_user:
                    logger.warning(
                        "Poll participant %s not found when awarding reward points",
                        participant_id,
                    )
            try:
                await app.state.polls.mark_reward_points_awarded(poll_id)
                poll = poll.model_copy(update={"rewardPointsAwarded": True})
            except Exception as exc:  # pragma: no cover - best-effort logging
                logger.warning("Failed to record poll reward point distribution: %s", exc)
        except Exception as exc:  # pragma: no cover - best-effort logging
            logger.warning("Failed to award poll reward points: %s", exc)

    try:
        users = await app.state.user.list_users_excluding_roles(["guest"])
        recipient_ids = [user.id for user in users if user.id]
        if recipient_ids:
            await notify_users(
                recipient_ids,
                notification_type=NotificationType.POLL_FINALIZED,
                title="Poll results are in",
                body=f"Results for '{poll.question}' are now available.",
                url=f"{FRONTEND_URL}/engage",
            )
    except Exception as exc:
        logger.warning("Failed to send poll notifications: %s", exc)
    return poll


###############################################################################

# Competitions


class NewCompetition(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=500)
    details: str = Field(min_length=1)
    imageUrl: str | None = Field(default=None, max_length=2048)
    isActive: bool = Field(default=True)


class UpdateCompetition(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, min_length=1, max_length=500)
    details: str | None = Field(default=None, min_length=1)
    imageUrl: str | None = Field(default=None, max_length=2048)
    isActive: bool | None = None


class CompetitionSubmissionPayload(BaseModel):
    participantId: str
    content: str = Field(min_length=1, max_length=5000)


@app.post("/api/competitions", status_code=status.HTTP_201_CREATED, response_model=CompetitionData)
async def create_competition(payload: NewCompetition, admin_user: AdminUser) -> CompetitionData:
    _ = admin_user
    title = payload.title.strip()
    summary = payload.summary.strip()
    details = payload.details.strip()
    if not title or not summary or not details:
        raise HTTPException(status_code=400, detail="Competition title, summary and details are required")
    image_url = payload.imageUrl.strip() if payload.imageUrl else None
    return await app.state.competitions.create_competition(
        title=title,
        summary=summary,
        details=details,
        image_url=image_url,
        is_active=payload.isActive,
    )


@app.get("/api/competitions", response_model=list[CompetitionData])
async def list_competitions(participantId: str | None = None) -> list[CompetitionData]:
    return await app.state.competitions.list_competitions(participant_id=participantId)


@app.get("/api/competitions/{competition_id}", response_model=CompetitionData)
async def get_competition(competition_id: str, participantId: str | None = None) -> CompetitionData:
    competition = await app.state.competitions.get_competition(competition_id, participant_id=participantId)
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return competition


@app.patch("/api/competitions/{competition_id}", response_model=CompetitionData)
async def update_competition(competition_id: str, payload: UpdateCompetition, admin_user: AdminUser) -> CompetitionData:
    _ = admin_user
    updates = payload.dict(exclude_unset=True)
    kwargs: dict[str, object] = {}
    if "title" in updates:
        title_value = (updates["title"] or "").strip()
        if not title_value:
            raise HTTPException(status_code=400, detail="Competition title cannot be empty")
        kwargs["title"] = title_value
    if "summary" in updates:
        summary_value = (updates["summary"] or "").strip()
        if not summary_value:
            raise HTTPException(status_code=400, detail="Competition summary cannot be empty")
        kwargs["summary"] = summary_value
    if "details" in updates:
        details_value = (updates["details"] or "").strip()
        if not details_value:
            raise HTTPException(status_code=400, detail="Competition details cannot be empty")
        kwargs["details"] = details_value
    if "imageUrl" in updates:
        image_value = updates["imageUrl"]
        kwargs["image_url"] = image_value.strip() if image_value else None
    if "isActive" in updates:
        kwargs["is_active"] = updates["isActive"]
    competition = await app.state.competitions.update_competition(competition_id, **kwargs)
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return competition


@app.delete("/api/competitions/{competition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_competition(competition_id: str, admin_user: AdminUser):
    _ = admin_user
    deleted = await app.state.competitions.delete_competition(competition_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Competition not found")


@app.post(
    "/api/competitions/{competition_id}/submit",
    status_code=status.HTTP_201_CREATED,
    response_model=CompetitionSubmissionData,
)
async def submit_competition_entry(competition_id: str, payload: CompetitionSubmissionPayload) -> CompetitionSubmissionData:
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Submission cannot be empty")
    submission = await app.state.competitions.submit_entry(
        competition_id,
        participant_id=payload.participantId,
        content=content,
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Competition not found")
    return submission


@app.get(
    "/api/admin/competitions/{competition_id}/submissions",
    response_model=list[CompetitionSubmissionData],
)
async def list_competition_submissions(competition_id: str) -> list[CompetitionSubmissionData]:
    return await app.state.competitions.list_submissions(
        competition_id,
        include_participant=True,
    )


###############################################################################

# Analytics


class AnalyticsSummary(BaseModel):
    totalEvents: int = 0
    totalRsvps: int = 0
    activeUsers: int = 0
    averageRsvpsPerEvent: float = 0.0
    eventsWithRsvps: int = 0


class AnalyticsRangeInfo(BaseModel):
    key: str
    label: str
    start: datetime
    end: datetime
    monthCount: int


class AnalyticsChartPoint(BaseModel):
    period: str
    count: int


class AnalyticsCategorySlice(BaseModel):
    label: str
    count: int
    percentage: float


class AnalyticsTagCount(BaseModel):
    tag: str
    count: int


class AnalyticsDayPopularity(BaseModel):
    dayOfWeek: int
    label: str
    count: int


class AnalyticsHourPopularity(BaseModel):
    hour: int
    label: str
    count: int


class AnalyticsPopularTimes(BaseModel):
    byDay: list[AnalyticsDayPopularity]
    byHour: list[AnalyticsHourPopularity]


class AnalyticsTagDataset(BaseModel):
    label: str
    start: datetime
    end: datetime
    data: list[AnalyticsTagCount]


class AnalyticsTagPopularity(BaseModel):
    currentMonth: AnalyticsTagDataset
    pastThreeMonths: AnalyticsTagDataset
    pastSixMonths: AnalyticsTagDataset
    pastYear: AnalyticsTagDataset


class AnalyticsDashboardResponse(BaseModel):
    generatedAt: datetime
    range: AnalyticsRangeInfo
    summary: AnalyticsSummary
    attendanceTrend: list[AnalyticsChartPoint]
    categoryDistribution: list[AnalyticsCategorySlice]
    popularEventTimes: AnalyticsPopularTimes
    newUserGrowth: list[AnalyticsChartPoint]
    eventTagPopularity: AnalyticsTagPopularity


@app.get("/api/analytics/dashboard", response_model=AnalyticsDashboardResponse)
async def get_analytics_dashboard(
    _admin: AdminUser,
    range_key: str | None = Query(default=None, alias="range"),
    start_month: str | None = Query(default=None, alias="startMonth"),
    end_month: str | None = Query(default=None, alias="endMonth"),
) -> AnalyticsDashboardResponse:
    try:
        payload = await app.state.analytics.get_dashboard(
            range_key=range_key,
            start_month=start_month,
            end_month=end_month,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AnalyticsDashboardResponse.model_validate(payload)


###############################################################################


#argv=sys.argv[1:]
def main():
    try:
        uvicorn.run("server:app", host="0.0.0.0", port=3001, reload=False)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
