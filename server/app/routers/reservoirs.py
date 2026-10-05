from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import db
from ..config import settings
from ..services.reservoir_service import get_latest_reservoir_snapshot, refresh_reservoir_snapshot

router = APIRouter(prefix="/api/reservoirs", tags=["reservoirs"])


class ReservoirReadingResponse(BaseModel):
    reservoirName: str
    storageML: float
    capacityML: float
    percentage: float
    waterLevel: float | None = None
    rainfall24h: float | None = None
    rainfallSeason: float | None = None
    change24h: float | None = None
    status: Literal["Healthy", "Moderate", "Watch", "Critical"]
    lastUpdated: str
    latitude: float
    longitude: float
    sourceUrl: str


class ReservoirCurrentResponse(BaseModel):
    source: str
    sourceUrl: str
    sourceStatus: Literal["live", "cached", "unavailable"]
    error: str | None = None
    lastUpdated: str | None = None
    daysSinceUpdate: int = 0
    dailyDemandML: float
    totalUsefulStorageML: float
    totalUsefulCapacityML: float
    overallUsefulStoragePercent: float
    daysOfSupply: float
    readings: list[ReservoirReadingResponse]


class HistoricalReadingResponse(BaseModel):
    date: str
    percent_stock: float
    content_ml: float
    rainfall_mm_24hr: float


class OverflowEventResponse(BaseModel):
    lake_name: str
    year: int
    overflow_date: str


@router.get("/current", response_model=ReservoirCurrentResponse)
async def get_current_reservoirs() -> ReservoirCurrentResponse:
    snapshot = await get_latest_reservoir_snapshot()
    locations = db.get_lake_locations()
    readings = [
        ReservoirReadingResponse(
            **reading,
            latitude=locations.get(reading["reservoirName"], (0.0, 0.0))[0],
            longitude=locations.get(reading["reservoirName"], (0.0, 0.0))[1],
            sourceUrl=snapshot.get("sourceUrl", ""),
        )
        for reading in snapshot.get("readings", [])
    ]
    last_updated = snapshot.get("lastUpdated")
    try:
        days_since = (datetime.now(ZoneInfo("Asia/Kolkata")).date() - datetime.fromisoformat(last_updated).date()).days if last_updated else 0
    except (TypeError, ValueError):
        days_since = 0

    return ReservoirCurrentResponse(
        source=snapshot.get("source", "BMC Hydraulic Engineer's Department"),
        sourceUrl=snapshot.get("sourceUrl", ""),
        sourceStatus=snapshot.get("sourceStatus", "unavailable"),
        error=snapshot.get("error"),
        lastUpdated=last_updated,
        daysSinceUpdate=days_since,
        dailyDemandML=settings.RESERVOIR_DEMAND_ML_DAY,
        totalUsefulStorageML=snapshot.get("totalUsefulStorageML", 0),
        totalUsefulCapacityML=snapshot.get("totalUsefulCapacityML", 0),
        overallUsefulStoragePercent=snapshot.get("overallUsefulStoragePercent", 0),
        daysOfSupply=round(snapshot.get("totalUsefulStorageML", 0) / settings.RESERVOIR_DEMAND_ML_DAY, 1) if settings.RESERVOIR_DEMAND_ML_DAY else 0,
        readings=readings,
    )


@router.get("/history", response_model=list[HistoricalReadingResponse])
async def get_reservoir_history(
    lake: Optional[str] = Query(None, description="Lake name. Omit for citywide combined history."),
    days: int = Query(90, ge=1, le=365, description="Number of days of history.")
) -> list[HistoricalReadingResponse]:
    # Start date limit
    start_date = (date.today() - timedelta(days=days)).isoformat()
    
    with db._cursor() as conn:
        cursor = conn.cursor()
        if lake:
            cursor.execute(
                """
                SELECT date, percent_stock, content_ml, rainfall_mm_24hr
                FROM reservoir_readings
                WHERE lake_name = ? AND date >= ?
                ORDER BY date ASC
                """,
                (lake, start_date)
            )
        else:
            # Citywide combined history (weighted percent stock)
            cursor.execute(
                """
                SELECT 
                    r.date,
                    ROUND(SUM(r.percent_stock * l.full_capacity_ml) / SUM(l.full_capacity_ml), 2) as percent_stock,
                    ROUND(SUM(r.content_ml), 2) as content_ml,
                    ROUND(SUM(r.rainfall_mm_24hr), 1) as rainfall_mm_24hr
                FROM reservoir_readings r
                JOIN lakes l ON r.lake_name = l.lake_name
                WHERE r.date >= ?
                GROUP BY r.date
                ORDER BY r.date ASC
                """,
                (start_date,)
            )
            
        rows = cursor.fetchall()
        
    return [
        HistoricalReadingResponse(
            date=row[0],
            percent_stock=row[1],
            content_ml=row[2],
            rainfall_mm_24hr=row[3]
        )
        for row in rows
    ]


@router.get("/overflow-events", response_model=list[OverflowEventResponse])
async def get_overflow_events(
    lake: Optional[str] = Query(None, description="Lake name to filter overflow events.")
) -> list[OverflowEventResponse]:
    with db._cursor() as conn:
        cursor = conn.cursor()
        if lake:
            cursor.execute(
                """
                SELECT lake_name, year, overflow_date
                FROM overflow_events
                WHERE lake_name = ?
                ORDER BY year DESC
                """,
                (lake,)
            )
        else:
            cursor.execute(
                """
                SELECT lake_name, year, overflow_date
                FROM overflow_events
                ORDER BY year DESC, lake_name ASC
                """
            )
        rows = cursor.fetchall()
        
    return [
        OverflowEventResponse(
            lake_name=row[0],
            year=row[1],
            overflow_date=row[2]
        )
        for row in rows
    ]


@router.post("/scrape")
async def trigger_manual_scrape() -> dict:
    snapshot = await refresh_reservoir_snapshot()
    if snapshot.get("sourceStatus") != "live":
        raise HTTPException(status_code=502, detail=snapshot.get("error", "Live BMC reservoir data unavailable."))
    return {"status": "ok", "message": "Latest BMC reservoir report retrieved.", "data": snapshot}


