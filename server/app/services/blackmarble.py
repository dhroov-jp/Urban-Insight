import logging
import os
from datetime import date, timedelta
from pathlib import Path
import random

import geopandas as gpd
import httpx
import numpy as np
from shapely.geometry import box

from .. import db
from ..config import settings

logger = logging.getLogger(__name__)

_EARTHDATA_TOKEN_URL = "https://urs.earthdata.nasa.gov/api/users/token"


def _get_earthdata_token() -> str | None:
    token = (settings.BLACKMARBLE_TOKEN or os.getenv("BLACKMARBLE_TOKEN") or "").strip()
    if token:
        return token

    if not settings.EARTHDATA_USERNAME or not settings.EARTHDATA_PASSWORD:
        logger.warning("No Earthdata credentials configured; real Black Marble data cannot be fetched.")
        return None

    try:
        response = httpx.post(
            _EARTHDATA_TOKEN_URL,
            auth=(settings.EARTHDATA_USERNAME, settings.EARTHDATA_PASSWORD),
            timeout=30,
        )
        payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        token = payload.get("access_token") or payload.get("token")
        if token:
            os.environ["BLACKMARBLE_TOKEN"] = token
            settings.BLACKMARBLE_TOKEN = token
            return token

        if response.status_code == 403 and "max_token_limit" in response.text:
            logger.warning(
                "Earthdata token limit reached. Delete expired Black Marble tokens in your Earthdata profile or set BLACKMARBLE_TOKEN explicitly."
            )
        else:
            logger.warning("Earthdata token request failed: %s %s", response.status_code, response.text[:200])
    except Exception as exc:  # pragma: no cover - runtime network path
        logger.warning("Earthdata token generation failed: %s", exc)

    return None


def _build_mumbai_bbox() -> gpd.GeoDataFrame:
    polygon = box(72.8, 18.9, 73.0, 19.3)
    return gpd.GeoDataFrame({"id": [1]}, geometry=[polygon], crs="EPSG:4326")


def _get_mumbai_grid_points() -> list[tuple[float, float]]:
    lats = [19.02, 19.08, 19.14, 19.20, 19.26]
    lngs = [72.82, 72.88, 72.94, 73.00]
    points: list[tuple[float, float]] = []
    for lat in lats:
        for lng in lngs:
            if lat > 19.18 and lng > 72.92:
                continue
            points.append((round(lat, 4), round(lng, 4)))
    return points


def _store_real_lighting_data(date_values: dict[str, float]) -> None:
    rows: list[tuple[str, float, float, str]] = []
    readings: list[tuple[str, str, float, bool, bool]] = []

    for lat, lng in _get_mumbai_grid_points():
        grid_id = f"g_{lat:.4f}_{lng:.4f}"
        rows.append((grid_id, float(lat), float(lng), "residential"))

        for day_iso, value in date_values.items():
            readings.append((grid_id, day_iso, max(float(value), 0.1), False, False))

    with db._cursor() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO lighting_grids (grid_id, latitude, longitude, land_use_class) VALUES (?, ?, ?, ?)",
            rows,
        )
        conn.executemany(
            "INSERT OR REPLACE INTO lighting_readings (grid_id, date, radiance, is_cloudy, is_seeded) VALUES (?, ?, ?, ?, ?)",
            readings,
        )


def _fetch_real_lighting_values() -> dict[str, float]:
    token = _get_earthdata_token()
    if not token:
        return {}

    try:
        from blackmarble import BlackMarble, Product

        bm = BlackMarble(
            token=token,
            output_directory=Path(__file__).resolve().parents[1] / "data" / "blackmarble",
            output_skip_if_exists=True,
        )

        lookback_days = 90
        end_date = date.today()
        dates = [end_date - timedelta(days=i) for i in range(lookback_days)]

        ds = bm.raster(
            gdf=_build_mumbai_bbox(),
            product_id=Product.VNP46A2,
            date_range=dates,
            variable="DNB_BRDF-Corrected_NTL",
        )

        if not ds.data_vars:
            raise ValueError("Black Marble raster returned no usable data variables.")

        var_name = next(iter(ds.data_vars))
        values_by_date: dict[str, float] = {}

        for time_value in ds["time"].values:
            day = str(time_value)[:10]
            arr = np.asarray(ds[var_name].sel(time=time_value).values, dtype=float)
            finite = arr[np.isfinite(arr)]
            if finite.size == 0:
                continue
            values_by_date[day] = float(np.nanmean(finite))

        if not values_by_date:
            raise ValueError("Black Marble returned no valid radiance values for the requested Mumbai window.")

        return values_by_date
    except Exception as exc:
        logger.warning("Real Black Marble fetch failed: %s", exc)
        return {}


async def fetch_and_process_latest_lighting():
    """
    Attempts a real NASA Black Marble fetch using Earthdata credentials. If the
    token is unavailable or the archive cannot be queried, it falls back to the
    existing mock seed so the app remains operational.
    """
    logger.info("Starting nightly Black Marble (VNP46A2) fetch...")

    today = date.today()
    latest_pass_date = (today - timedelta(days=1)).isoformat()

    if not settings.EARTHDATA_USERNAME:
        logger.warning("No EARTHDATA_USERNAME configured; using seeded mock lighting data.")
        _seed_mock_grids_if_empty(latest_pass_date)
        return

    real_values = _fetch_real_lighting_values()
    if real_values:
        logger.info("Real Black Marble lighting values fetched successfully for %s dates.", len(real_values))
        _store_real_lighting_data(real_values)
        return

    logger.warning("Real Black Marble fetch unavailable; falling back to seeded mock grids for the latest pass date.")
    _seed_mock_grids_if_empty(latest_pass_date)

def _seed_mock_grids_if_empty(date_str: str):
    logger.info("Seeding mock lighting grids across Mumbai bounding box...")
    
    import numpy as np
    lats = np.arange(18.9, 19.3, 0.02)
    lngs = np.arange(72.8, 73.0, 0.02)
    
    grid_rows = []
    reading_rows = []
    
    current_date = date.fromisoformat(date_str)
    
    for lat in lats:
        for lng in lngs:
            grid_id = f"g_{lat:.3f}_{lng:.3f}"
            
            # Natural areas (SGNP in north, some coastal water)
            if lat > 19.18 and lng > 72.88:
                lu = "natural"
            elif lng < 72.82:
                lu = "natural" # water
            else:
                lu = "residential" if random.random() > 0.4 else "road"
                
            grid_rows.append((grid_id, float(lat), float(lng), lu))
            
            base = 2.0 if lu == "natural" else 25.0 if lu == "residential" else 35.0
            
            is_chronic = lu == "road" and random.random() < 0.1
            is_dimmer = lu == "residential" and random.random() < 0.1
            
            for i in range(90):
                d = (current_date - timedelta(days=i)).isoformat()
                is_cloudy = random.random() < 0.15
                
                rad = base + random.uniform(-2, 2)
                if i == 0 and is_dimmer:
                    rad = base * 0.5
                if i < 5 and is_chronic:
                    rad = base * 0.4
                    
                # is_seeded = True
                reading_rows.append((grid_id, d, max(0.1, rad), is_cloudy, True))
                
    # Batch insert
    with db._cursor() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO lighting_grids (grid_id, latitude, longitude, land_use_class) VALUES (?, ?, ?, ?)",
            grid_rows
        )
        conn.executemany(
            "INSERT OR IGNORE INTO lighting_readings (grid_id, date, radiance, is_cloudy, is_seeded) VALUES (?, ?, ?, ?, ?)",
            reading_rows
        )
    logger.info("Mock lighting grids seeded.")
