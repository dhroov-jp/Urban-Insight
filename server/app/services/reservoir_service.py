import json
import logging
from pathlib import Path
from typing import Any

from ..config import settings
from .scraper import scrape_lake_readings

logger = logging.getLogger("urbaninsight.reservoir_service")

RESERVOIR_NAMES = {
    "Bhatsa",
    "Upper Vaitarna",
    "Middle Vaitarna",
    "Modak Sagar",
    "Tansa",
    "Vihar",
    "Tulsi",
}

CAPACITIES_ML = {
    "Bhatsa": 717037,
    "Upper Vaitarna": 227047,
    "Middle Vaitarna": 193530,
    "Modak Sagar": 128925,
    "Tansa": 145080,
    "Vihar": 27698,
    "Tulsi": 8046,
}

CACHE_PATH = Path(settings.DATABASE_PATH).parent / "reservoir_latest.json"
SOURCE_NAME = "BMC Hydraulic Engineer's Department / Master Control Centre, Bhandup Complex"


def classify_status(percentage: float) -> str:
    if percentage >= 90:
        return "Healthy"
    if percentage >= 70:
        return "Moderate"
    if percentage >= 40:
        return "Watch"
    return "Critical"


def _report_timestamp(report_date: str) -> str:
    if "T" in report_date:
        return report_date
    return f"{report_date}T06:00:00+05:30"


def _normalize_readings(readings: list[dict[str, Any]], last_updated: str) -> list[dict[str, Any]]:
    normalized = []
    for reading in readings:
        name = reading.get("reservoirName") or reading.get("lake_name")
        if name not in RESERVOIR_NAMES:
            continue
        storage = reading.get("storageML", reading.get("content_ml"))
        capacity = reading.get("capacityML", reading.get("full_capacity_ml", CAPACITIES_ML[name]))
        percentage = reading.get("percentage", reading.get("percent_stock"))
        if storage is None or capacity is None:
            continue
        if percentage is None:
            percentage = round(float(storage) / float(capacity) * 100, 2)
        normalized.append({
            "reservoirName": name,
            "storageML": round(float(storage), 2),
            "capacityML": round(float(capacity), 2),
            "percentage": round(float(percentage), 2),
            "waterLevel": reading.get("waterLevel"),
            "rainfall24h": reading.get("rainfall24h", reading.get("rainfall_mm_24hr")),
            "rainfallSeason": reading.get("rainfallSeason"),
            "change24h": reading.get("change24h"),
            "status": classify_status(float(percentage)),
            "lastUpdated": last_updated,
        })
    return normalized


def _normalize_snapshot(payload: dict[str, Any], source_url: str) -> dict[str, Any]:
    report_date = payload.get("lastUpdated") or payload.get("date")
    if not report_date:
        raise ValueError("BMC report did not include a report date")
    last_updated = _report_timestamp(str(report_date))

    readings = _normalize_readings(payload.get("readings", []), last_updated)
    if {reading["reservoirName"] for reading in readings} != RESERVOIR_NAMES:
        raise ValueError("BMC report did not contain all seven Mumbai reservoirs")

    total_storage = round(sum(reading["storageML"] for reading in readings), 2)
    total_capacity = round(sum(reading["capacityML"] for reading in readings), 2)
    return {
        "source": payload.get("source", SOURCE_NAME),
        "sourceUrl": source_url or payload.get("sourceUrl", ""),
        "lastUpdated": last_updated,
        "overallUsefulStoragePercent": round(total_storage / total_capacity * 100, 2),
        "totalUsefulStorageML": total_storage,
        "totalUsefulCapacityML": total_capacity,
        "readings": readings,
    }


def _load_cache() -> dict[str, Any] | None:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError) as error:
        logger.warning("Unable to read reservoir cache: %s", error)
        return None


def _save_cache(snapshot: dict[str, Any]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")


def _with_status(snapshot: dict[str, Any], source_status: str, error: str | None = None) -> dict[str, Any]:
    result = dict(snapshot)
    result["readings"] = _normalize_readings(result.get("readings", []), result.get("lastUpdated", ""))
    result["totalUsefulStorageML"] = round(sum(reading["storageML"] for reading in result["readings"]), 2)
    result["totalUsefulCapacityML"] = round(sum(reading["capacityML"] for reading in result["readings"]), 2)
    if result["totalUsefulCapacityML"]:
        result["overallUsefulStoragePercent"] = round(result["totalUsefulStorageML"] / result["totalUsefulCapacityML"] * 100, 2)
    result["sourceStatus"] = source_status
    result["source"] = result.get("source", SOURCE_NAME)
    result["error"] = error
    return result


async def get_latest_reservoir_snapshot() -> dict[str, Any]:
    source_url = settings.RESERVOIR_SCRAPER_URL.strip()
    cache = _load_cache()

    if not source_url or source_url.endswith("/mock-source"):
        message = "No live BMC reservoir source is configured. Showing the last successful snapshot."
        return _with_status(cache, "cached", message) if cache else _with_status({"readings": []}, "unavailable", message)

    try:
        report = await scrape_lake_readings(source_url)
        snapshot = _normalize_snapshot(report, source_url)
        _save_cache(snapshot)
        return _with_status(snapshot, "live")
    except Exception as error:
        logger.warning("BMC reservoir refresh failed: %s", error)
        message = f"Live BMC reservoir data unavailable: {error}"
        return _with_status(cache, "cached", message) if cache else _with_status({"readings": []}, "unavailable", message)


async def refresh_reservoir_snapshot() -> dict[str, Any]:
    return await get_latest_reservoir_snapshot()
