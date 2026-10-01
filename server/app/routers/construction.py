from __future__ import annotations

import hashlib
import math
from datetime import date, timedelta

import httpx
from fastapi import APIRouter, HTTPException

from .. import db
from ..config import settings
from ..models import ConstructionCheckRequest, ConstructionCheckResponse, SceneInfo
from ..services import sentinelhub_client as sh
from ..services.aoi import AOITooLargeError, bbox_of, hash_aoi, to_shapely, validate_aoi_size
from ..services.ndbi import compute_change
from ..services.thumbnails import save_thumbnail

router = APIRouter(prefix="/api/construction", tags=["construction"])


def _output_dimensions(bbox: list[float]) -> tuple[int, int]:
    """Pick a Processing API output size close to native 10m resolution,
    capped so requests stay fast."""
    min_lon, min_lat, max_lon, max_lat = bbox
    mean_lat = (min_lat + max_lat) / 2
    width_m = (max_lon - min_lon) * 111_320 * math.cos(math.radians(mean_lat))
    height_m = (max_lat - min_lat) * 111_320

    width = max(64, min(1024, round(width_m / settings.PROCESSING_RESOLUTION_M)))
    height = max(64, min(1024, round(height_m / settings.PROCESSING_RESOLUTION_M)))
    return width, height


def _cache_key(aoi_hash: str, before_date: str, after_date: str, threshold: float) -> str:
    raw = f"{aoi_hash}:{before_date}:{after_date}:{threshold:.3f}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


@router.post("/check", response_model=ConstructionCheckResponse)
async def check_construction_activity(req: ConstructionCheckRequest) -> ConstructionCheckResponse:
    geom = to_shapely(req.aoi)
    try:
        validate_aoi_size(geom)
    except AOITooLargeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    bbox = bbox_of(geom)
    aoi_hash = hash_aoi(req.aoi)
    dr = req.date_range
    lookback_days = dr.lookback_days if dr else settings.DEFAULT_LOOKBACK_DAYS
    baseline_offset_days = dr.baseline_offset_days if dr else settings.DEFAULT_BASELINE_OFFSET_DAYS
    baseline_window_days = dr.baseline_window_days if dr else settings.DEFAULT_BASELINE_WINDOW_DAYS
    max_cloud_cover = dr.max_cloud_cover if dr else settings.DEFAULT_MAX_CLOUD_COVER
    threshold = req.ndbi_change_threshold if req.ndbi_change_threshold is not None else settings.NDBI_CHANGE_THRESHOLD

    today = date.today()

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            after_scene = await sh.find_best_scene(
                client,
                bbox=bbox,
                date_from=(today - timedelta(days=lookback_days)).isoformat(),
                date_to=today.isoformat(),
                max_cloud_cover=max_cloud_cover,
            )
        except sh.SentinelHubAuthError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except sh.SentinelHubError as e:
            raise HTTPException(status_code=502, detail=f"Sentinel Hub Catalog error: {e}")

        if not after_scene:
            return ConstructionCheckResponse(
                aoi_hash=aoi_hash,
                cached=False,
                status="no_scenes_found",
                score=0.0,
                change_geojson={"type": "FeatureCollection", "features": []},
                message=(
                    f"No cloud-free Sentinel-2 scene found in the last {lookback_days} days "
                    f"(cloud cover < {max_cloud_cover}%). Try a longer lookback window."
                ),
            )

        baseline_center = date.fromisoformat(after_scene["date"]) - timedelta(days=baseline_offset_days)
        try:
            before_scene = await sh.find_best_scene(
                client,
                bbox=bbox,
                date_from=(baseline_center - timedelta(days=baseline_window_days)).isoformat(),
                date_to=(baseline_center + timedelta(days=baseline_window_days)).isoformat(),
                max_cloud_cover=max_cloud_cover,
            )
        except sh.SentinelHubError as e:
            raise HTTPException(status_code=502, detail=f"Sentinel Hub Catalog error: {e}")

        if not before_scene:
            return ConstructionCheckResponse(
                aoi_hash=aoi_hash,
                cached=False,
                status="no_scenes_found",
                score=0.0,
                change_geojson={"type": "FeatureCollection", "features": []},
                after_scene=SceneInfo(**after_scene),
                message=(
                    f"Found an 'after' scene ({after_scene['date']}) but no cloud-free baseline scene "
                    f"near {baseline_center.isoformat()} (±{baseline_window_days}d). Try widening the baseline window."
                ),
            )

        cache_key = _cache_key(aoi_hash, before_scene["date"], after_scene["date"], threshold)
        if not req.force_refresh:
            cached = db.get_cached_result(cache_key)
            if cached:
                return ConstructionCheckResponse(**cached, cached=True)

        width, height = _output_dimensions(bbox)

        try:
            before_tiff, after_tiff = await _fetch_pair(client, bbox, before_scene["date"], after_scene["date"], width, height)
            before_png, after_png = await _fetch_thumbnail_pair(client, bbox, before_scene["date"], after_scene["date"])
        except sh.SentinelHubError as e:
            raise HTTPException(status_code=502, detail=f"Sentinel Hub Processing API error: {e}")

    try:
        analysis = compute_change(before_tiff, after_tiff, ndbi_change_threshold=threshold)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    before_thumb_url = save_thumbnail(aoi_hash, "before", before_scene["date"], before_png)
    after_thumb_url = save_thumbnail(aoi_hash, "after", after_scene["date"], after_png)

    response = ConstructionCheckResponse(
        aoi_hash=aoi_hash,
        cached=False,
        status="ok",
        score=analysis["score"],
        change_geojson=analysis["change_geojson"],
        stats=analysis["stats"],
        before_scene=SceneInfo(**before_scene),
        after_scene=SceneInfo(**after_scene),
        before_thumbnail_url=before_thumb_url,
        after_thumbnail_url=after_thumb_url,
    )

    db.set_cached_result(
        cache_key,
        aoi_hash=aoi_hash,
        before_date=before_scene["date"],
        after_date=after_scene["date"],
        result=response.model_dump(exclude={"cached"}),
    )

    return response


async def _fetch_pair(client, bbox, before_date, after_date, width, height):
    import asyncio

    before_tiff, after_tiff = await asyncio.gather(
        sh.fetch_ndbi_ndvi_tiff(client, bbox, before_date, width, height),
        sh.fetch_ndbi_ndvi_tiff(client, bbox, after_date, width, height),
    )
    return before_tiff, after_tiff


async def _fetch_thumbnail_pair(client, bbox, before_date, after_date):
    import asyncio

    thumb_w, thumb_h = min(settings.THUMBNAIL_MAX_PX, 512), min(settings.THUMBNAIL_MAX_PX, 512)
    before_png, after_png = await asyncio.gather(
        sh.fetch_true_color_png(client, bbox, before_date, thumb_w, thumb_h),
        sh.fetch_true_color_png(client, bbox, after_date, thumb_w, thumb_h),
    )
    return before_png, after_png
