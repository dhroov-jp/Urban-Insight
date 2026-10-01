from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .. import db
from ..config import settings
from ..services.scraper import scrape_lake_readings

router = APIRouter(prefix="/api/reservoirs", tags=["reservoirs"])


class LakeReadingResponse(BaseModel):
    lake_name: str
    latitude: float
    longitude: float
    full_capacity_ml: float
    date: str
    percent_stock: float
    content_ml: float
    rainfall_mm_24hr: float
    source_url: str


class ReservoirCurrentResponse(BaseModel):
    last_updated: str
    days_since_update: int
    demand_ml_day: float
    total_content_ml: float
    total_capacity_ml: float
    combined_percent_stock: float
    days_of_supply_remaining: float
    readings: list[LakeReadingResponse]


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
    with db._cursor() as conn:
        cursor = conn.cursor()
        
        # Get the latest date available in readings
        cursor.execute("SELECT MAX(date) FROM reservoir_readings")
        row = cursor.fetchone()
        if not row or not row[0]:
            # No data in database
            return ReservoirCurrentResponse(
                last_updated="",
                days_since_update=0,
                demand_ml_day=settings.RESERVOIR_DEMAND_ML_DAY,
                total_content_ml=0.0,
                total_capacity_ml=0.0,
                combined_percent_stock=0.0,
                days_of_supply_remaining=0.0,
                readings=[]
            )
            
        latest_date_str = row[0]
        
        # Get all readings for that date
        cursor.execute(
            """
            SELECT 
                r.lake_name, l.latitude, l.longitude, l.full_capacity_ml,
                r.date, r.percent_stock, r.content_ml, r.rainfall_mm_24hr, r.source_url
            FROM reservoir_readings r
            JOIN lakes l ON r.lake_name = l.lake_name
            WHERE r.date = ?
            """,
            (latest_date_str,)
        )
        rows = cursor.fetchall()
        
    readings = []
    total_content = 0.0
    total_capacity = 0.0
    
    for r in rows:
        readings.append(
            LakeReadingResponse(
                lake_name=r[0],
                latitude=r[1],
                longitude=r[2],
                full_capacity_ml=r[3],
                date=r[4],
                percent_stock=r[5],
                content_ml=r[6],
                rainfall_mm_24hr=r[7],
                source_url=r[8]
            )
        )
        total_content += r[6]
        total_capacity += r[3]
        
    combined_percent = round((total_content / total_capacity) * 100, 2) if total_capacity > 0 else 0.0
    days_supply = round(total_content / settings.RESERVOIR_DEMAND_ML_DAY, 1) if settings.RESERVOIR_DEMAND_ML_DAY > 0 else 0.0
    
    # Calculate days since last update
    try:
        latest_date = date.fromisoformat(latest_date_str)
        days_since = (date.today() - latest_date).days
    except ValueError:
        days_since = 0
        
    return ReservoirCurrentResponse(
        last_updated=latest_date_str,
        days_since_update=days_since,
        demand_ml_day=settings.RESERVOIR_DEMAND_ML_DAY,
        total_content_ml=round(total_content, 2),
        total_capacity_ml=round(total_capacity, 2),
        combined_percent_stock=combined_percent,
        days_of_supply_remaining=days_supply,
        readings=readings
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
    url = settings.RESERVOIR_SCRAPER_URL
    if not url:
        raise HTTPException(status_code=400, detail="No scraper URL configured in settings.")
        
    try:
        data = await scrape_lake_readings(url)
        readings = data.get("readings", [])
        report_date = data.get("date", date.today().isoformat())
        
        if readings and len(readings) == 7:
            db.save_scraped_readings(readings, report_date, url)
            return {
                "status": "ok",
                "message": f"Successfully scraped and stored readings for date {report_date}",
                "data": data
            }
        else:
            raise HTTPException(
                status_code=502,
                detail=f"Incomplete readings scraped (found {len(readings)} of 7 lakes). Data not saved."
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Manual scrape failed: {str(e)}. No changes were written to the database."
        )


@router.get("/mock-source", response_class=HTMLResponse)
async def get_mock_source_page() -> str:
    """
    Returns a mock HTML page representation of a BMC water stock table.
    Useful for local testing and out-of-the-box deployment.
    """
    today_str = date.today().isoformat()
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Mumbai Water Supply Daily Report - {today_str}</title>
    </head>
    <body>
        <h1>Brihanmumbai Municipal Corporation</h1>
        <h2>Hydraulic Engineer's Department</h2>
        <h3>Water Stock Report as of {today_str} at 06:00 AM</h3>
        <p>Report Date: {today_str}</p>
        <table border="1">
            <thead>
                <tr>
                    <th>Lake Name</th>
                    <th>Full Capacity (ML)</th>
                    <th>Useful Live Stock (ML)</th>
                    <th>Percentage Stock (%)</th>
                    <th>24 Hr Rainfall (mm)</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Upper Vaitarna</td><td>227047</td><td>208883.2</td><td>92.00</td><td>10.5</td></tr>
                <tr><td>Modak Sagar</td><td>128925</td><td>128925.0</td><td>100.00</td><td>35.0</td></tr>
                <tr><td>Tansa</td><td>145080</td><td>145080.0</td><td>100.00</td><td>24.4</td></tr>
                <tr><td>Middle Vaitarna</td><td>193530</td><td>174177.0</td><td>90.00</td><td>12.8</td></tr>
                <tr><td>Bhatsa</td><td>717037</td><td>609481.5</td><td>85.00</td><td>18.2</td></tr>
                <tr><td>Vihar</td><td>27698</td><td>27698.0</td><td>100.00</td><td>8.0</td></tr>
                <tr><td>Tulsi</td><td>8046</td><td>8046.0</td><td>100.00</td><td>4.0</td></tr>
                <tr><td>Combined Total</td><td>1447363</td><td>1302290.7</td><td>89.98</td><td>15.5</td></tr>
            </tbody>
        </table>
    </body>
    </html>
    """
