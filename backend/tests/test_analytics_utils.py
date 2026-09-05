from datetime import datetime, timezone

import pytest

from analytics import build_month_series, resolve_time_range


def test_resolve_current_month_range():
    anchor = datetime(2025, 1, 15, tzinfo=timezone.utc)
    result = resolve_time_range(range_key="current_month", start_month=None, end_month=None, now=anchor)
    assert result.start == datetime(2025, 1, 1, tzinfo=timezone.utc)
    assert result.end == datetime(2025, 2, 1, tzinfo=timezone.utc)
    assert result.month_count == 1
    assert result.key == "current_month"


def test_resolve_past_three_months_range():
    anchor = datetime(2025, 3, 5, tzinfo=timezone.utc)
    result = resolve_time_range(range_key="past_3_months", start_month=None, end_month=None, now=anchor)
    assert result.start == datetime(2025, 1, 1, tzinfo=timezone.utc)
    assert result.end == datetime(2025, 4, 1, tzinfo=timezone.utc)
    assert result.month_count == 3
    assert "Past 3 months" in result.label


def test_resolve_custom_range():
    result = resolve_time_range(range_key="custom", start_month="2024-01", end_month="2024-03", now=None)
    assert result.start == datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert result.end == datetime(2024, 4, 1, tzinfo=timezone.utc)
    assert result.month_count == 3
    assert result.key == "custom"
    assert "Jan 2024" in result.label
    assert "Mar 2024" in result.label


def test_resolve_custom_range_invalid_order():
    with pytest.raises(ValueError):
        resolve_time_range(range_key="custom", start_month="2024-05", end_month="2024-03", now=None)


def test_resolve_defaults_to_current_month():
    anchor = datetime(2024, 12, 8, tzinfo=timezone.utc)
    result = resolve_time_range(range_key=None, start_month=None, end_month=None, now=anchor)
    assert result.key == "current_month"
    assert result.start == datetime(2024, 12, 1, tzinfo=timezone.utc)
    assert result.end == datetime(2025, 1, 1, tzinfo=timezone.utc)
    assert result.month_count == 1


def test_build_month_series_fills_gaps():
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end = datetime(2024, 4, 1, tzinfo=timezone.utc)
    raw = {"2024-01": 5, "2024-03": 2}
    series = build_month_series(raw, start, end)
    assert series == [
        {"period": "2024-01", "count": 5},
        {"period": "2024-02", "count": 0},
        {"period": "2024-03", "count": 2},
    ]
