"""Analytics data access and aggregation utilities for MUSEngage."""

from __future__ import annotations

import asyncio
import copy
from dataclasses import dataclass
from datetime import UTC, datetime, timezone
from typing import Any, Iterable

from cachetools import TTLCache
from motor.motor_asyncio import AsyncIOMotorCollection


MonthKey = str


@dataclass(frozen=True)
class TimeRange:
    """Represents an inclusive month-bounded time window."""

    key: str
    label: str
    start: datetime
    end: datetime
    month_count: int


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _month_floor(value: datetime) -> datetime:
    value = _ensure_utc(value)
    return datetime(value.year, value.month, 1, tzinfo=timezone.utc)


def _add_months(value: datetime, *, months: int) -> datetime:
    value = _ensure_utc(value)
    total_months = value.year * 12 + (value.month - 1) + months
    year, month_index = divmod(total_months, 12)
    month = month_index + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def _parse_month_string(value: str) -> datetime:
    try:
        parsed = datetime.strptime(value, "%Y-%m")
    except ValueError as exc:  # pragma: no cover - defensive; validated in tests
        raise ValueError(f"Invalid month format: {value!r}") from exc
    return parsed.replace(tzinfo=timezone.utc)


def _count_months(start: datetime, end: datetime) -> int:
    count = 0
    cursor = _month_floor(start)
    while cursor < end:
        count += 1
        cursor = _add_months(cursor, months=1)
    return max(count, 0)


def _month_iter(start: datetime, end: datetime) -> Iterable[datetime]:
    cursor = _month_floor(start)
    while cursor < end:
        yield cursor
        cursor = _add_months(cursor, months=1)


def resolve_time_range(
    *,
    range_key: str | None,
    start_month: str | None,
    end_month: str | None,
    now: datetime | None = None,
) -> TimeRange:
    current = _month_floor(now or datetime.now(UTC))
    key = (range_key or "current_month").strip().lower()

    presets: dict[str, tuple[int, str]] = {
        "current_month": (1, "Current month"),
        "past_3_months": (3, "Past 3 months"),
        "past_6_months": (6, "Past 6 months"),
        "past_year": (12, "Past year"),
    }

    if key == "custom":
        if not start_month or not end_month:
            raise ValueError("Custom range requires both startMonth and endMonth")
        start = _month_floor(_parse_month_string(start_month))
        inclusive_end = _month_floor(_parse_month_string(end_month))
        if inclusive_end < start:
            raise ValueError("endMonth must not be earlier than startMonth")
        end = _add_months(inclusive_end, months=1)
        label = f"Custom ({start.strftime('%b %Y')} – {inclusive_end.strftime('%b %Y')})"
        month_count = _count_months(start, end)
        return TimeRange(key="custom", label=label, start=start, end=end, month_count=month_count)

    if key not in presets:
        raise ValueError("Unsupported analytics range")

    months, label = presets[key]
    start = _add_months(current, months=-(months - 1)) if months > 1 else current
    end = _add_months(current, months=1)
    month_count = _count_months(start, end)
    return TimeRange(key=key, label=label, start=start, end=end, month_count=month_count)


def build_month_series(raw: dict[str, int], start: datetime, end: datetime) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    for cursor in _month_iter(start, end):
        label = cursor.strftime("%Y-%m")
        series.append({"period": label, "count": int(raw.get(label, 0))})
    return series


class AnalyticsService:
    """Provides cached analytics aggregates for the dashboard."""

    def __init__(
        self,
        events: AsyncIOMotorCollection,
        users: AsyncIOMotorCollection,
        *,
        cache_ttl_seconds: int = 300,
    ) -> None:
        self._events = events
        self._users = users
        self._cache: TTLCache[tuple[str, str, str], dict[str, Any]] = TTLCache(maxsize=64, ttl=cache_ttl_seconds)
        self._cache_lock = asyncio.Lock()

    async def get_dashboard(
        self,
        *,
        range_key: str | None,
        start_month: str | None,
        end_month: str | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        time_range = resolve_time_range(
            range_key=range_key,
            start_month=start_month,
            end_month=end_month,
            now=now,
        )
        cache_key = (time_range.key, time_range.start.isoformat(), time_range.end.isoformat())
        async with self._cache_lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return copy.deepcopy(cached)

        payload = await self._build_dashboard_payload(time_range)
        async with self._cache_lock:
            self._cache[cache_key] = copy.deepcopy(payload)
        return payload

    async def _build_dashboard_payload(self, time_range: TimeRange) -> dict[str, Any]:
        summary_task = asyncio.create_task(self._compute_summary(time_range))
        attendance_task = asyncio.create_task(self._attendance_trend(time_range))
        category_task = asyncio.create_task(self._category_distribution(time_range, limit=7))
        popular_times_task = asyncio.create_task(self._popular_event_times(time_range))
        new_users_task = asyncio.create_task(self._new_user_growth(time_range))
        tag_popularity_task = asyncio.create_task(self._tag_popularity_overview())

        summary = await summary_task
        (
            attendance_trend,
            category_distribution,
            popular_times,
            new_users,
            tag_popularity,
        ) = await asyncio.gather(
            attendance_task,
            category_task,
            popular_times_task,
            new_users_task,
            tag_popularity_task,
        )

        payload: dict[str, Any] = {
            "generatedAt": datetime.now(timezone.utc),
            "range": {
                "key": time_range.key,
                "label": time_range.label,
                "start": time_range.start,
                "end": time_range.end,
                "monthCount": time_range.month_count,
            },
            "summary": summary,
            "attendanceTrend": attendance_trend,
            "categoryDistribution": category_distribution,
            "popularEventTimes": popular_times,
            "newUserGrowth": new_users,
            "eventTagPopularity": tag_popularity,
        }
        return payload

    async def _compute_summary(self, time_range: TimeRange) -> dict[str, Any]:
        start, end = time_range.start, time_range.end
        event_count = await self._events.count_documents({"created_at": {"$gte": start, "$lt": end}})
        rsvp_stats = await self._aggregate_rsvp_stats(start, end)
        total_rsvps = rsvp_stats.get("total_rsvps", 0)
        active_users = rsvp_stats.get("active_users", 0)
        events_with_rsvp = rsvp_stats.get("events_with_rsvp", 0)
        average = float(total_rsvps) / float(event_count) if event_count else 0.0
        summary = {
            "totalEvents": int(event_count),
            "totalRsvps": int(total_rsvps),
            "activeUsers": int(active_users),
            "averageRsvpsPerEvent": round(average, 2),
            "eventsWithRsvps": int(events_with_rsvp),
        }
        return summary

    async def _aggregate_rsvp_stats(self, start: datetime, end: datetime) -> dict[str, int]:
        pipeline = [
            {"$match": {"rsvp.attendees": {"$exists": True, "$ne": []}}},
            {
                "$project": {
                    "attendees": "$rsvp.attendees",
                }
            },
            {"$unwind": "$attendees"},
            {
                "$match": {
                    "attendees.rsvp_at": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": "$_id",
                    "rsvp_count": {"$sum": 1},
                    "unique_users": {"$addToSet": "$attendees.user_id"},
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_rsvps": {"$sum": "$rsvp_count"},
                    "events_with_rsvp": {"$sum": 1},
                    "unique_user_sets": {"$push": "$unique_users"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "total_rsvps": 1,
                    "events_with_rsvp": 1,
                    "active_users": {"$size": {"$setUnion": "$unique_user_sets"}},
                }
            },
        ]
        cursor = self._events.aggregate(pipeline)
        result = await cursor.to_list(length=1)
        if not result:
            return {"total_rsvps": 0, "active_users": 0, "events_with_rsvp": 0}
        record = result[0]
        return {
            "total_rsvps": int(record.get("total_rsvps", 0)),
            "active_users": int(record.get("active_users", 0)),
            "events_with_rsvp": int(record.get("events_with_rsvp", 0)),
        }

    async def _attendance_trend(self, time_range: TimeRange) -> list[dict[str, Any]]:
        start, end = time_range.start, time_range.end
        pipeline = [
            {"$match": {"rsvp.attendees": {"$exists": True, "$ne": []}}},
            {"$project": {"attendees": "$rsvp.attendees"}},
            {"$unwind": "$attendees"},
            {"$match": {"attendees.rsvp_at": {"$gte": start, "$lt": end}}},
            {
                "$group": {
                    "_id": {
                        "$dateTrunc": {
                            "date": "$attendees.rsvp_at",
                            "unit": "month",
                            "timezone": "UTC",
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
        cursor = self._events.aggregate(pipeline)
        rows = await cursor.to_list(length=None)
        raw = {row["_id"].strftime("%Y-%m"): int(row.get("count", 0)) for row in rows if row.get("_id")}
        return build_month_series(raw, start, end)

    async def _category_distribution(self, time_range: TimeRange, *, limit: int) -> list[dict[str, Any]]:
        start, end = time_range.start, time_range.end
        pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lt": end}}},
            {
                "$project": {
                    "tags": {
                        "$cond": [
                            {"$isArray": "$tags"},
                            "$tags",
                            [],
                        ]
                    }
                }
            },
            {
                "$unwind": {
                    "path": "$tags",
                    "preserveNullAndEmptyArrays": True,
                }
            },
            {
                "$group": {
                    "_id": "$tags",
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1, "_id": 1}},
        ]
        cursor = self._events.aggregate(pipeline)
        rows = await cursor.to_list(length=None)

        def _normalise_label(value: Any) -> str:
            if value is None:
                return "Uncategorised"
            label = str(value).strip()
            return label or "Uncategorised"

        values = [
            {"label": _normalise_label(row.get("_id")), "count": int(row.get("count", 0))}
            for row in rows
        ]
        collapsed: list[dict[str, Any]] = []
        if len(values) <= limit:
            collapsed = values
        else:
            head = values[: limit - 1]
            tail_count = sum(item["count"] for item in values[limit - 1 :])
            head.append({"label": "Other", "count": int(tail_count)})
            collapsed = head

        total = sum(item["count"] for item in collapsed) or 1
        for item in collapsed:
            item["percentage"] = round((item["count"] / total) * 100, 2)
        return collapsed

    async def _popular_event_times(self, time_range: TimeRange) -> dict[str, Any]:
        start, end = time_range.start, time_range.end
        pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lt": end}}},
            {
                "$project": {
                    "day": {"$isoDayOfWeek": "$created_at"},
                    "hour": {
                        "$hour": {"date": "$created_at", "timezone": "UTC"},
                    },
                }
            },
            {
                "$group": {
                    "_id": {"day": "$day", "hour": "$hour"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id.day": 1, "_id.hour": 1}},
        ]
        cursor = self._events.aggregate(pipeline)
        rows = await cursor.to_list(length=None)
        day_totals: dict[int, int] = {}
        hour_totals: dict[int, int] = {}
        for row in rows:
            key = row.get("_id") or {}
            day = int(key.get("day", 0))
            hour = int(key.get("hour", 0))
            count = int(row.get("count", 0))
            if day:
                day_totals[day] = day_totals.get(day, 0) + count
            hour_totals[hour] = hour_totals.get(hour, 0) + count

        day_labels = [
            (1, "Monday"),
            (2, "Tuesday"),
            (3, "Wednesday"),
            (4, "Thursday"),
            (5, "Friday"),
            (6, "Saturday"),
            (7, "Sunday"),
        ]
        by_day = [
            {
                "dayOfWeek": day - 1,
                "label": label,
                "count": int(day_totals.get(day, 0)),
            }
            for day, label in day_labels
        ]
        by_hour = [
            {
                "hour": hour,
                "label": f"{hour:02d}:00",
                "count": int(hour_totals.get(hour, 0)),
            }
            for hour in range(24)
        ]
        return {"byDay": by_day, "byHour": by_hour}

    async def _new_user_growth(self, time_range: TimeRange) -> list[dict[str, Any]]:
        start, end = time_range.start, time_range.end
        pipeline = [
            {
                "$project": {
                    "role": "$role",
                    "created_at": {
                        "$ifNull": [
                            "$created_at",
                            {"$toDate": "$_id"},
                        ]
                    },
                }
            },
            {"$match": {"role": {"$ne": "guest"}}},
            {
                "$match": {
                    "created_at": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateTrunc": {
                            "date": "$created_at",
                            "unit": "month",
                            "timezone": "UTC",
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
        cursor = self._users.aggregate(pipeline)
        rows = await cursor.to_list(length=None)
        raw = {row["_id"].strftime("%Y-%m"): int(row.get("count", 0)) for row in rows if row.get("_id")}
        return build_month_series(raw, start, end)

    async def _tag_popularity_overview(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        current_month = _month_floor(now)
        ranges = {
            "currentMonth": (current_month, _add_months(current_month, months=1), "This month"),
            "pastThreeMonths": (
                _add_months(current_month, months=-2),
                _add_months(current_month, months=1),
                "Past 3 months",
            ),
            "pastSixMonths": (
                _add_months(current_month, months=-5),
                _add_months(current_month, months=1),
                "Past 6 months",
            ),
            "pastYear": (
                _add_months(current_month, months=-11),
                _add_months(current_month, months=1),
                "Past year",
            ),
        }
        results: dict[str, Any] = {}
        for key, (start, end, label) in ranges.items():
            results[key] = {
                "label": label,
                "data": await self._tag_popularity(start, end, limit=10),
                "start": start,
                "end": end,
            }
        return results

    async def _tag_popularity(self, start: datetime, end: datetime, *, limit: int) -> list[dict[str, Any]]:
        pipeline = [
            {"$match": {"rsvp.attendees": {"$exists": True, "$ne": []}}},
            {
                "$project": {
                    "tags": {
                        "$cond": [
                            {"$isArray": "$tags"},
                            "$tags",
                            [],
                        ]
                    },
                    "attendees": "$rsvp.attendees",
                }
            },
            {"$unwind": "$attendees"},
            {"$match": {"attendees.rsvp_at": {"$gte": start, "$lt": end}}},
            {"$unwind": "$tags"},
            {
                "$group": {
                    "_id": "$tags",
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1, "_id": 1}},
            {"$limit": limit},
        ]
        cursor = self._events.aggregate(pipeline)
        rows = await cursor.to_list(length=None)
        data = []
        for row in rows:
            tag = str(row.get("_id", "")).strip()
            if not tag:
                continue
            data.append({"tag": tag, "count": int(row.get("count", 0))})
        return data


__all__ = [
    "AnalyticsService",
    "TimeRange",
    "build_month_series",
    "resolve_time_range",
]
