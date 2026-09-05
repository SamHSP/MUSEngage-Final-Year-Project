import asyncio
import logging
import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


def _require_env(var_name: str) -> str:
    value = os.getenv(var_name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {var_name}")
    return value


SENDER_EMAIL = _require_env("SENDER_EMAIL")
SENDER_PASSWORD = _require_env("SENDER_PASSWORD")

security_logger = logging.getLogger("musengage.security.otp")


def send_email(code: str, to_email: str) -> None:
    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email
    msg["Subject"] = "MUSEngage OTP Authentication"
    msg.attach(MIMEText(f"Hello, your OTP is - {code}", "plain"))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, to_email, msg.as_string())
    except Exception as exc:  # pragma: no cover - network interaction
        security_logger.error("send_email failed: %s", repr(exc))


class OTPDAL:
    OTP_CHARSET = string.digits
    OTP_LENGTH = 6
    OTP_TTL_MINUTES = 5
    MAX_ATTEMPTS = 5

    def __init__(self, otps):
        self.otps = otps
        self._logger = security_logger

    def _generate_code(self, length: int = OTP_LENGTH) -> str:
        return "".join(secrets.choice(self.OTP_CHARSET) for _ in range(length))

    async def create_otp(self, email: str, ttl_minutes: int = OTP_TTL_MINUTES) -> str:
        email = email.strip().lower()
        code = self._generate_code()
        await asyncio.to_thread(send_email, code, email)
        expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
        await self.otps.delete_many({"email": email})
        await self.otps.insert_one(
            {
                "email": email,
                "code": code,
                "expires_at": expires,
                "verified": False,
                "attempts": 0,
                "locked": False,
                "created_at": datetime.now(timezone.utc),
            }
        )
        self._logger.info("OTP created for %s", email)
        return code

    async def verify_otp(self, email: str, code: str) -> bool:
        email = email.strip().lower()
        now = datetime.now(timezone.utc)
        rec = await self.otps.find_one(
            {
                "email": email,
                "verified": False,
                "expires_at": {"$gt": now},
            }
        )
        if not rec:
            self._logger.warning("OTP verification failed for %s: no active OTP", email)
            return False

        if rec.get("locked"):
            self._logger.warning("OTP locked for %s", email)
            return False

        submitted_code = code.strip()
        attempts = int(rec.get("attempts", 0)) + 1

        if rec.get("code") != submitted_code:
            await self.otps.update_one(
                {"_id": rec["_id"]},
                {
                    "$set": {
                        "attempts": attempts,
                        "locked": attempts >= self.MAX_ATTEMPTS,
                        "updated_at": now,
                    }
                },
            )
            if attempts >= self.MAX_ATTEMPTS:
                self._logger.error("OTP locked after max attempts for %s", email)
            else:
                self._logger.warning("OTP mismatch for %s (attempt %s)", email, attempts)
            return False

        await self.otps.delete_one({"_id": rec["_id"]})
        self._logger.info("OTP verified and cleared for %s", email)
        return True
