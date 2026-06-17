#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bourbon Pourcast Drop Tracker builder

Purpose:
  Build drop_tracker.csv as a derived public data file from:
    - drop_history.csv      (announced drops from Wake ABC delta workflow)
    - drop_table.csv        (known store drop weekdays)
    - drop_confirmations.csv (optional, private/manual confirmed drops)

Output:
  drop_tracker.csv with columns:
    ExpectedDate, AnnouncedDate, ConfirmedDate, Store, Brand, Board,
    Status, DaysSinceLast, Source

Important design choice:
  The frontend reads drop_tracker.csv directly. It does not calculate expectations
  from drop_history.csv/drop_table.csv in the browser. This keeps the public site
  simple and gives us a stable place to add confirmed/verified data later.
"""

import csv
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HISTORY_CSV = "drop_history.csv"
DROP_TABLE_CSV = "drop_table.csv"
CONFIRMATIONS_CSV = "drop_confirmations.csv"
OUTPUT_CSV = "drop_tracker.csv"

MIN_DAYS_SINCE_LAST_FOR_EXPECTED = int(os.getenv("DROP_TRACKER_MIN_DAYS", "27"))
LOOKAHEAD_DAYS = int(os.getenv("DROP_TRACKER_LOOKAHEAD_DAYS", "7"))
ET = ZoneInfo("America/New_York")
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def norm(s: str) -> str:
    return " ".join((s or "").strip().lower().split())


def get_ci(row, *names):
    """Case/spacing tolerant CSV lookup."""
    wanted = {n.lower().replace("_", "").replace(" ", "") for n in names}
    for k, v in (row or {}).items():
        key = (k or "").lower().replace("_", "").replace(" ", "")
        if key in wanted:
            return (v or "").strip()
    return ""


def parse_dt(value):
    if not value:
        return None
    s = str(value).strip()
    fmts = [
        "%A, %Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%y %I:%M %p",
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=ET)
        except Exception:
            pass
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ET)
        return dt.astimezone(ET)
    except Exception:
        return None


def iso_date(d):
    if not d:
        return ""
    if isinstance(d, datetime):
        return d.date().isoformat()
    return d.isoformat()


def weekday_title(value):
    s = (value or "").strip().lower()
    for d in WEEKDAYS:
        if d.lower() == s:
            return d
    return ""


def previous_or_same_weekday(base_date, weekday_name):
    if not base_date or not weekday_name:
        return None
    target = WEEKDAYS.index(weekday_name)  # Monday=0
    offset = (base_date.weekday() - target) % 7
    return base_date - timedelta(days=offset)


def next_weekday_on_or_after(base_date, weekday_name):
    if not base_date or not weekday_name:
        return None
    target = WEEKDAYS.index(weekday_name)  # Monday=0
    offset = (target - base_date.weekday()) % 7
    return base_date + timedelta(days=offset)


def load_drop_table(path=DROP_TABLE_CSV):
    rows = []
    if not os.path.exists(path):
        print(f"⚠️ {path} not found; expected rows cannot be generated.")
        return rows
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            store = get_ci(row, "StoreAddress", "Store", "Location")
            drop_day = weekday_title(get_ci(row, "DropDay", "Drop Day", "Weekday", "Day"))
            board = get_ci(row, "Board", "ABCBoard", "County") or "Wake County ABC"
            if store and drop_day:
                rows.append({"store": store, "drop_day": drop_day, "board": board})
    return rows


def load_history(path=HISTORY_CSV):
    rows = []
    if not os.path.exists(path):
        print(f"⚠️ {path} not found; announced rows cannot be generated.")
        return rows
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts = parse_dt(get_ci(row, "TimestampDetected", "Timestamp", "Date", "DropDate", "EffectiveDate"))
            store = get_ci(row, "StoreAddress", "Store", "Location")
            brand = get_ci(row, "Brand", "Product", "ProductName", "Description")
            board = get_ci(row, "Board", "ABCBoard", "County") or "Wake County ABC"
            if ts and (store or brand):
                rows.append({"date": ts.date(), "store": store, "brand": brand, "board": board})
    return rows


def load_confirmations(path=CONFIRMATIONS_CSV):
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt = parse_dt(get_ci(row, "ConfirmedDate", "VerifiedDate", "Date"))
            store = get_ci(row, "Store", "StoreAddress", "Location")
            brand = get_ci(row, "Brand", "Product", "ProductName")
            board = get_ci(row, "Board", "ABCBoard", "County") or "Wake County ABC"
            source = get_ci(row, "Source") or "manual"
            if dt and store:
                rows.append({"date": dt.date(), "store": store, "brand": brand, "board": board, "source": source})
    return rows


def build():
    today = datetime.now(ET).date()
    drop_table = load_drop_table()
    history = load_history()
    confirmations = load_confirmations()

    drop_day_by_store = {norm(r["store"]): r["drop_day"] for r in drop_table}
    board_by_store = {norm(r["store"]): r.get("board") or "Wake County ABC" for r in drop_table}

    # Most recent known activity by store, including announced and confirmed rows.
    last_activity_by_store = {}
    for r in history:
        key = norm(r["store"])
        if key and (key not in last_activity_by_store or r["date"] > last_activity_by_store[key]):
            last_activity_by_store[key] = r["date"]
    for r in confirmations:
        key = norm(r["store"])
        if key and (key not in last_activity_by_store or r["date"] > last_activity_by_store[key]):
            last_activity_by_store[key] = r["date"]

    output = []

    # Announced rows: derived from Wake delta/drop_history. ExpectedDate is the known drop weekday
    # on or immediately before the announced date, which helps expose reporting lag.
    for r in history:
        key = norm(r["store"])
        drop_day = drop_day_by_store.get(key)
        expected_date = previous_or_same_weekday(r["date"], drop_day) if drop_day else None
        days_since_last = ""
        output.append({
            "ExpectedDate": iso_date(expected_date),
            "AnnouncedDate": iso_date(r["date"]),
            "ConfirmedDate": "",
            "Store": r["store"],
            "Brand": r["brand"],
            "Board": r["board"] or board_by_store.get(key, "Wake County ABC"),
            "Status": "announced",
            "DaysSinceLast": days_since_last,
            "Source": "wake_delta",
        })

    # Confirmed rows: optional private/manual data. These can remain behind the scenes until ready.
    for r in confirmations:
        key = norm(r["store"])
        drop_day = drop_day_by_store.get(key)
        expected_date = previous_or_same_weekday(r["date"], drop_day) if drop_day else None
        output.append({
            "ExpectedDate": iso_date(expected_date),
            "AnnouncedDate": "",
            "ConfirmedDate": iso_date(r["date"]),
            "Store": r["store"],
            "Brand": r["brand"],
            "Board": r["board"] or board_by_store.get(key, "Wake County ABC"),
            "Status": "confirmed",
            "DaysSinceLast": "",
            "Source": r.get("source") or "manual",
        })

    # Expected rows: store-level only, no brand promise.
    # If a store's known drop day occurs in the next 7 days and it has been at least
    # MIN_DAYS_SINCE_LAST_FOR_EXPECTED days since known activity, add an expected row.
    for r in drop_table:
        key = norm(r["store"])
        expected_date = next_weekday_on_or_after(today, r["drop_day"])
        if not expected_date or expected_date > today + timedelta(days=LOOKAHEAD_DAYS):
            continue
        last_activity = last_activity_by_store.get(key)
        days_since = (expected_date - last_activity).days if last_activity else ""
        if last_activity and days_since < MIN_DAYS_SINCE_LAST_FOR_EXPECTED:
            continue

        output.append({
            "ExpectedDate": iso_date(expected_date),
            "AnnouncedDate": "",
            "ConfirmedDate": "",
            "Store": r["store"],
            "Brand": "",
            "Board": r.get("board") or "Wake County ABC",
            "Status": "expected",
            "DaysSinceLast": days_since,
            "Source": "drop_table_rule",
        })

    # Sort useful for humans and stable diffs: future expected first, then recent announced.
    status_order = {"expected": 0, "confirmed": 1, "announced": 2}
    def sort_key(row):
        date_value = row["ExpectedDate"] or row["ConfirmedDate"] or row["AnnouncedDate"] or "9999-12-31"
        return (status_order.get(row["Status"], 9), date_value, row["Store"].lower(), row["Brand"].lower())
    output.sort(key=sort_key)

    header = ["ExpectedDate", "AnnouncedDate", "ConfirmedDate", "Store", "Brand", "Board", "Status", "DaysSinceLast", "Source"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(output)

    print(f"✅ Wrote {OUTPUT_CSV} ({len(output)} rows: expected={sum(1 for r in output if r['Status']=='expected')}, announced={sum(1 for r in output if r['Status']=='announced')}, confirmed={sum(1 for r in output if r['Status']=='confirmed')})")


if __name__ == "__main__":
    build()
