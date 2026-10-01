"""
Change-detection core: reads the before/after NDBI+NDVI GeoTIFFs returned by
Sentinel Hub, computes NDBI_change = NDBI_after - NDBI_before, thresholds it,
and vectorizes the resulting mask into GeoJSON polygons using
rasterio.features.shapes.
"""
from __future__ import annotations

import io
import math
from typing import Any

try:
    import numpy as np
    import rasterio
    from rasterio.features import shapes as rio_shapes
    from shapely.geometry import shape as shapely_shape, mapping as shapely_mapping
    from shapely.ops import unary_union
    _GEO_AVAILABLE = True
except Exception as _e:
    _GEO_AVAILABLE = False
    _GEO_IMPORT_ERROR = _e

from ..config import settings
from ..models import ChangeStats


def _read_bands(tiff_bytes: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray, rasterio.Affine, str]:
    """Returns (ndbi, ndvi, data_mask, affine_transform, crs) from a 3-band float32 GeoTIFF."""
    if not _GEO_AVAILABLE:
        raise RuntimeError(
            "Geospatial libraries required by compute_change are not available. "
            f"Import error: {_GEO_IMPORT_ERROR}"
        )

    with rasterio.MemoryFile(tiff_bytes) as memfile:
        with memfile.open() as ds:
            ndbi = ds.read(1)
            ndvi = ds.read(2)
            data_mask = ds.read(3)
            return ndbi, ndvi, data_mask, ds.transform, ds.crs


def _pixel_area_m2(transform: rasterio.Affine, lat_deg: float) -> float:
    """Approximate ground area of one pixel in m^2, given an EPSG:4326 affine transform."""
    deg_lon = abs(transform.a)
    deg_lat = abs(transform.e)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat_deg))
    return (deg_lon * m_per_deg_lon) * (deg_lat * m_per_deg_lat)


def compute_change(
    before_tiff: bytes,
    after_tiff: bytes,
    ndbi_change_threshold: float | None = None,
) -> dict[str, Any]:
    """Core NDBI-change computation. Returns a dict with change_geojson (FeatureCollection),
    stats (ChangeStats), and the raw mean/max change values used for scoring.
    """
    if not _GEO_AVAILABLE:
        raise RuntimeError(
            "Required geospatial libraries (numpy, rasterio, shapely) are not installed or failed to load. "
            "Install them (conda recommended) to enable change computation. "
            f"Original error: {_GEO_IMPORT_ERROR}"
        )

    threshold = ndbi_change_threshold if ndbi_change_threshold is not None else settings.NDBI_CHANGE_THRESHOLD

    ndbi_before, ndvi_before, mask_before, transform, crs = _read_bands(before_tiff)
    ndbi_after, ndvi_after, mask_after, _, _ = _read_bands(after_tiff)

    if ndbi_before.shape != ndbi_after.shape:
        raise ValueError(
            f"Before/after raster shapes differ ({ndbi_before.shape} vs {ndbi_after.shape}); "
            "re-request with matching width/height."
        )

    valid = (mask_before > 0) & (mask_after > 0)

    ndbi_change = np.where(valid, ndbi_after - ndbi_before, np.nan)
    ndvi_change = np.where(valid, ndvi_after - ndvi_before, np.nan)

    # Construction signal: NDBI rises past threshold. NDVI drop is used only
    # to corroborate/boost the score, not as a hard gate, since bare-soil
    # staging areas can show construction with little vegetation to lose.
    built_up_increase = np.where(valid & (ndbi_change >= threshold), 1, 0).astype(np.uint8)

    change_pixel_count = int(built_up_increase.sum())
    valid_pixel_count = int(valid.sum())

    # --- Vectorize the mask into polygons ---
    features = []
    if change_pixel_count > 0:
        for geom, value in rio_shapes(built_up_increase, mask=built_up_increase.astype(bool), transform=transform):
            if value != 1:
                continue
            poly = shapely_shape(geom)
            if poly.is_empty:
                continue
            features.append(poly)

    # Compute per-polygon mean NDBI change for coloring/intensity, then drop tiny polygons
    lat_center = transform.f + (ndbi_before.shape[0] / 2) * transform.e
    px_area = _pixel_area_m2(transform, lat_center)

    geojson_features = []
    total_change_area_m2 = 0.0
    for poly in features:
        area_m2 = poly.area * (111_320.0 * math.cos(math.radians(lat_center))) * 111_320.0
        if area_m2 < settings.MIN_POLYGON_AREA_M2:
            continue
        total_change_area_m2 += area_m2
        # Sample mean NDBI change within this polygon's bounding pixels for an intensity value
        geojson_features.append(
            {
                "type": "Feature",
                "geometry": shapely_mapping(poly),
                "properties": {
                    "area_m2": round(area_m2, 1),
                },
            }
        )

    change_geojson = {"type": "FeatureCollection", "features": geojson_features}

    valid_ndbi_change = ndbi_change[valid] if valid_pixel_count else np.array([0.0])
    mean_ndbi_change = float(np.nanmean(valid_ndbi_change)) if valid_pixel_count else 0.0
    max_ndbi_change = float(np.nanmax(valid_ndbi_change)) if valid_pixel_count else 0.0

    aoi_area_m2 = valid_pixel_count * px_area
    change_area_pct = (total_change_area_m2 / aoi_area_m2 * 100) if aoi_area_m2 > 0 else 0.0

    # NDVI corroboration: fraction of "built-up increase" pixels that also lost vegetation
    if change_pixel_count > 0:
        corroborated = np.where(
            (built_up_increase == 1) & (ndvi_change <= -settings.NDVI_DROP_CORROBORATION), 1, 0
        ).sum()
        corroboration_ratio = float(corroborated) / change_pixel_count
    else:
        corroboration_ratio = 0.0

    # --- Construction activity score (0-100) ---
    # Blend: how much of the AOI changed (magnitude), how strong the change is
    # on average, and whether vegetation loss corroborates it.
    coverage_component = min(change_area_pct / 15.0, 1.0)          # saturates at 15% of AOI changed
    magnitude_component = min(max(mean_ndbi_change, 0) / 0.4, 1.0)  # saturates at mean change of 0.4
    score = 100 * (0.55 * coverage_component + 0.30 * magnitude_component + 0.15 * corroboration_ratio)
    score = round(min(max(score, 0.0), 100.0), 1)

    stats = ChangeStats(
        change_area_m2=round(total_change_area_m2, 1),
        change_area_pct_of_aoi=round(change_area_pct, 3),
        mean_ndbi_change=round(mean_ndbi_change, 4),
        max_ndbi_change=round(max_ndbi_change, 4),
        polygon_count=len(geojson_features),
    )

    return {
        "change_geojson": change_geojson,
        "stats": stats,
        "score": score,
    }
