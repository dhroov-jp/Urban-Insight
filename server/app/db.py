"""
SQLite-backed cache for construction-activity results.

Deliberately isolated behind a tiny repository interface (get/set) so this
can be swapped for a PostGIS-backed implementation later without touching
the router or the analysis service: replace the two functions below with
equivalents that run `INSERT ... ON CONFLICT` / `SELECT` against a Postgres
table (ideally with a `geometry(MultiPolygon, 4326)` column instead of the
GeoJSON-text column used here, so you can index and query spatially).
"""
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from .config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS construction_checks (
    cache_key TEXT PRIMARY KEY,      -- hash(aoi) + before_date + after_date + threshold
    aoi_hash TEXT NOT NULL,
    before_date TEXT NOT NULL,
    after_date TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_construction_checks_aoi_hash
    ON construction_checks (aoi_hash);

CREATE TABLE IF NOT EXISTS lakes (
    lake_name TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    full_capacity_ml REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS reservoir_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lake_name TEXT NOT NULL REFERENCES lakes(lake_name),
    date TEXT NOT NULL,
    percent_stock REAL NOT NULL,
    content_ml REAL NOT NULL,
    rainfall_mm_24hr REAL NOT NULL,
    source_url TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservoir_readings_lake_date
    ON reservoir_readings (lake_name, date);

CREATE TABLE IF NOT EXISTS overflow_events (
    lake_name TEXT NOT NULL REFERENCES lakes(lake_name),
    year INTEGER NOT NULL,
    overflow_date TEXT NOT NULL,
    PRIMARY KEY (lake_name, year)
);

CREATE TABLE IF NOT EXISTS mumbai_zones (
    zone_name TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    population_density REAL NOT NULL,
    crime_rate REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS lighting_grids (
    grid_id TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    land_use_class TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lighting_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grid_id TEXT NOT NULL REFERENCES lighting_grids(grid_id),
    date TEXT NOT NULL,
    radiance REAL NOT NULL,
    is_cloudy BOOLEAN NOT NULL,
    is_seeded BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE(grid_id, date)
);
"""



def _connect() -> sqlite3.Connection:
    Path(settings.DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.DATABASE_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def _ensure_lighting_schema(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("SELECT is_seeded FROM lighting_readings LIMIT 1")
    except sqlite3.DatabaseError:
        conn.execute("ALTER TABLE lighting_readings ADD COLUMN is_seeded BOOLEAN NOT NULL DEFAULT 0")


def _seed_historical_data(conn: sqlite3.Connection) -> None:
    from datetime import date, timedelta
    import random

    # 1. Seed overflow events
    overflows = [
        ('Tulsi', 2023, '2023-07-20'),
        ('Tulsi', 2024, '2024-07-25'),
        ('Tulsi', 2025, '2025-07-15'),
        ('Tulsi', 2026, '2026-07-18'),
        ('Vihar', 2023, '2023-07-26'),
        ('Vihar', 2024, '2024-08-02'),
        ('Vihar', 2025, '2025-07-24'),
        ('Vihar', 2026, '2026-07-28'),
        ('Tansa', 2023, '2023-07-29'),
        ('Tansa', 2024, '2024-08-05'),
        ('Tansa', 2025, '2025-07-31'),
        ('Tansa', 2026, '2026-08-02'),
        ('Modak Sagar', 2023, '2023-07-27'),
        ('Modak Sagar', 2024, '2024-08-04'),
        ('Modak Sagar', 2025, '2025-07-26'),
        ('Modak Sagar', 2026, '2026-07-30'),
        ('Middle Vaitarna', 2024, '2024-08-15'),
        ('Middle Vaitarna', 2025, '2025-08-10'),
        ('Bhatsa', 2024, '2024-09-02'),
        ('Bhatsa', 2025, '2025-08-25')
    ]
    cursor = conn.cursor()
    cursor.executemany(
        "INSERT OR IGNORE INTO overflow_events (lake_name, year, overflow_date) VALUES (?, ?, ?)",
        overflows
    )

    # 2. Seed past 90 days of reservoir readings (simulating monsoon progression)
    lakes_info = {
        'Upper Vaitarna': {'cap': 227047.0, 'start': 15.0, 'rain_scale': 15.0},
        'Modak Sagar': {'cap': 128925.0, 'start': 22.0, 'rain_scale': 20.0},
        'Tansa': {'cap': 145080.0, 'start': 18.0, 'rain_scale': 18.0},
        'Middle Vaitarna': {'cap': 193530.0, 'start': 12.0, 'rain_scale': 15.0},
        'Bhatsa': {'cap': 717037.0, 'start': 25.0, 'rain_scale': 25.0},
        'Vihar': {'cap': 27698.0, 'start': 30.0, 'rain_scale': 12.0},
        'Tulsi': {'cap': 8046.0, 'start': 35.0, 'rain_scale': 10.0}
    }

    today = date(2026, 8, 12)
    readings = []

    for i in range(90, -1, -1):
        curr_date = today - timedelta(days=i)
        progress = (90 - i) / 90.0

        for name, info in lakes_info.items():
            cap = info['cap']
            start_pct = info['start']

            pct = start_pct + (92.0 - start_pct) * (progress ** 1.6)

            # Seed based on date to keep it deterministic
            random.seed(curr_date.toordinal() + hash(name))
            pct += random.uniform(-0.5, 0.5)
            pct = max(5.0, min(100.0, pct))

            content = (pct / 100.0) * cap

            is_rainy = random.uniform(0, 1) > 0.4
            if is_rainy:
                rain = random.uniform(5.0, info['rain_scale'] * 4)
                if progress > 0.4 and progress < 0.8:
                    rain *= 1.8
            else:
                rain = 0.0

            # If date is past the overflow date in 2026, set it to 100%
            if name in ['Tulsi', 'Vihar', 'Modak Sagar', 'Tansa']:
                ov_date_str = next((o[2] for o in overflows if o[0] == name and o[1] == 2026), None)
                if ov_date_str:
                    ov_date = date.fromisoformat(ov_date_str)
                    if curr_date >= ov_date:
                        pct = 100.0
                        content = cap

            readings.append((
                name,
                curr_date.isoformat(),
                round(pct, 2),
                round(content, 2),
                round(rain, 1),
                "http://localhost:8000/api/reservoirs/mock-source",
                (curr_date.isoformat() + "T06:00:00")
            ))

    cursor.executemany(
        """
        INSERT OR IGNORE INTO reservoir_readings (lake_name, date, percent_stock, content_ml, rainfall_mm_24hr, source_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        readings
    )


@contextmanager
def _cursor():
    conn = _connect()
    try:
        conn.executescript(_SCHEMA)
        _ensure_lighting_schema(conn)
        # Check if lakes are seeded
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM lakes")
        count = cursor.fetchone()[0]
        if count == 0:
            cursor.executemany(
                "INSERT INTO lakes (lake_name, latitude, longitude, full_capacity_ml) VALUES (?, ?, ?, ?)",
                [
                    ('Upper Vaitarna', 19.8143, 73.5429, 227047.0),
                    ('Modak Sagar', 19.6923, 73.3443, 128925.0),
                    ('Tansa', 19.5589, 73.2624, 145080.0),
                    ('Middle Vaitarna', 19.7062, 73.4329, 193530.0),
                    ('Bhatsa', 19.5131, 73.4174, 717037.0),
                    ('Vihar', 19.1440, 72.9100, 27698.0),
                    ('Tulsi', 19.1910, 72.9173, 8046.0),
                ]
            )
            _seed_historical_data(conn)
        
        # Check if mumbai_zones are seeded
        cursor.execute("SELECT COUNT(*) FROM mumbai_zones")
        zone_count = cursor.fetchone()[0]
        if zone_count == 0:
            cursor.executemany(
                "INSERT INTO mumbai_zones (zone_name, latitude, longitude, population_density, crime_rate) VALUES (?, ?, ?, ?, ?)",
                [
                    ('Bandra', 19.0596, 72.8295, 40000.0, 45.0),
                    ('Dharavi', 19.0700, 72.8600, 300000.0, 35.0),
                    ('Andheri', 19.1136, 72.8697, 35000.0, 52.0),
                    ('Colaba', 18.9220, 72.8347, 18000.0, 28.0),
                    ('Dadar', 19.0200, 72.8400, 45000.0, 38.0),
                    ('Kurla', 19.0760, 72.8777, 28000.0, 65.0),
                    ('Powai', 19.1197, 72.9051, 12000.0, 18.0),
                    ('Colaba Fort', 18.9350, 72.8300, 22000.0, 32.0),
                    ('Santacruz', 19.0900, 72.8500, 20000.0, 26.0),
                    ('BKC', 19.0850, 72.8900, 50000.0, 15.0),
                    ('Wadala', 19.0100, 72.8600, 19000.0, 34.0),
                    ('Goregaon', 19.1500, 72.8500, 16000.0, 29.0),
                    ('Sion', 19.0400, 72.8600, 32000.0, 41.0),
                    ('Mahim', 19.0400, 72.8430, 25000.0, 33.0),
                ]
            )
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_cached_result(cache_key: str, ttl_hours: int = settings.CACHE_TTL_HOURS) -> Optional[dict[str, Any]]:
    with _cursor() as conn:
        row = conn.execute(
            "SELECT result_json, created_at FROM construction_checks WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    if not row:
        return None
    result_json, created_at = row
    age_hours = (time.time() - created_at) / 3600
    if age_hours > ttl_hours:
        return None
    return json.loads(result_json)


def set_cached_result(cache_key: str, aoi_hash: str, before_date: str, after_date: str, result: dict[str, Any]) -> None:
    with _cursor() as conn:
        conn.execute(
            """
            INSERT INTO construction_checks (cache_key, aoi_hash, before_date, after_date, result_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                result_json = excluded.result_json,
                created_at = excluded.created_at
            """,
            (cache_key, aoi_hash, before_date, after_date, json.dumps(result), time.time()),
        )


def save_scraped_readings(readings: list[dict], date_str: str, source_url: str) -> None:
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    with _cursor() as conn:
        cursor = conn.cursor()
        for r in readings:
            cursor.execute(
                """
                INSERT INTO reservoir_readings (lake_name, date, percent_stock, content_ml, rainfall_mm_24hr, source_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(lake_name, date) DO UPDATE SET
                    percent_stock = excluded.percent_stock,
                    content_ml = excluded.content_ml,
                    rainfall_mm_24hr = excluded.rainfall_mm_24hr,
                    source_url = excluded.source_url,
                    created_at = excluded.created_at
                """,
                (r['lake_name'], date_str, r['percent_stock'], r['content_ml'], r['rainfall_mm_24hr'], source_url, created_at)
            )


def get_nearest_zone(lat: float, lng: float) -> Optional[dict[str, Any]]:
    with _cursor() as conn:
        row = conn.execute(
            """
            SELECT zone_name, population_density, crime_rate,
                   ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) as dist
            FROM mumbai_zones
            ORDER BY dist ASC
            LIMIT 1
            """,
            (lat, lat, lng, lng)
        ).fetchone()
    if not row:
        return None
    return {
        "zone_name": row[0],
        "population_density": row[1],
        "crime_rate": row[2]
    }


def get_nearest_lighting_grids(lat: float, lng: float, limit: int = 9) -> list[dict[str, Any]]:
    with _cursor() as conn:
        rows = conn.execute(
            """
            SELECT grid_id, latitude, longitude, land_use_class,
                   ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) as dist
            FROM lighting_grids
            ORDER BY dist ASC
            LIMIT ?
            """,
            (lat, lat, lng, lng, limit)
        ).fetchall()
    
    return [
        {"grid_id": r[0], "latitude": r[1], "longitude": r[2], "land_use_class": r[3]}
        for r in rows
    ]


def get_nearest_lake(lat: float, lng: float, max_distance: float = 0.012) -> Optional[str]:
    """Return the nearest known lake when the point is within roughly 1.2 km."""
    with _cursor() as conn:
        row = conn.execute(
            """
            SELECT lake_name,
                   ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) AS distance
            FROM lakes
            ORDER BY distance ASC
            LIMIT 1
            """,
            (lat, lat, lng, lng),
        ).fetchone()

    if row and row[1] <= max_distance * max_distance:
        return row[0]
    return None


def get_lake_locations() -> dict[str, tuple[float, float]]:
    with _cursor() as conn:
        rows = conn.execute("SELECT lake_name, latitude, longitude FROM lakes").fetchall()
    return {row[0]: (row[1], row[2]) for row in rows}


def get_lighting_readings(grid_id: str, days: int = 90) -> list[dict[str, Any]]:
    with _cursor() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        
        cursor.execute('''
        SELECT date, radiance, is_cloudy, is_seeded
        FROM lighting_readings
        WHERE grid_id = ? AND date >= ?
        ORDER BY date DESC
        ''', (grid_id, cutoff))
        
        return [dict(row) for row in cursor.fetchall()]


def save_lighting_grid(grid_id: str, lat: float, lng: float, land_use_class: str) -> None:
    with _cursor() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO lighting_grids (grid_id, latitude, longitude, land_use_class)
            VALUES (?, ?, ?, ?)
            """,
            (grid_id, lat, lng, land_use_class)
        )


def save_lighting_reading(grid_id: str, date: str, radiance: float, is_cloudy: bool, is_seeded: bool = False):
    with _cursor() as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
        INSERT OR REPLACE INTO lighting_readings (grid_id, date, radiance, is_cloudy, is_seeded)
        VALUES (?, ?, ?, ?, ?)
        ''', (grid_id, date, radiance, is_cloudy, is_seeded))
