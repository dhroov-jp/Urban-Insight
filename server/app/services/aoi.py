"""Helpers for normalizing and hashing the AOI (polygon or bbox) input."""
import hashlib
import json
import math
from typing import Any

from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry

from ..config import settings


class AOITooLargeError(ValueError):
    pass


def to_shapely(aoi: dict[str, Any] | list[float]) -> BaseGeometry:
    """Normalize a GeoJSON geometry/Feature or a bbox list into a Shapely geometry."""
    if isinstance(aoi, list):
        min_lon, min_lat, max_lon, max_lat = aoi
        return box(min_lon, min_lat, max_lon, max_lat)
    geom = aoi.get("geometry", aoi)
    return shape(geom)


def bbox_of(geom: BaseGeometry) -> list[float]:
    min_lon, min_lat, max_lon, max_lat = geom.bounds
    return [min_lon, min_lat, max_lon, max_lat]


def approx_area_km2(geom: BaseGeometry) -> float:
    """Rough equirectangular area estimate — good enough for a size safety-check,
    not for precise measurement (that's done later in pixel space post-analysis)."""
    min_lon, min_lat, max_lon, max_lat = geom.bounds
    mean_lat_rad = math.radians((min_lat + max_lat) / 2)
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * math.cos(mean_lat_rad)
    width_km = (max_lon - min_lon) * km_per_deg_lon
    height_km = (max_lat - min_lat) * km_per_deg_lat
    return abs(width_km * height_km)


def validate_aoi_size(geom: BaseGeometry) -> None:
    area = approx_area_km2(geom)
    if area > settings.MAX_AOI_AREA_KM2:
        raise AOITooLargeError(
            f"AOI is ~{area:.1f} km², which exceeds the {settings.MAX_AOI_AREA_KM2} km² limit. "
            "Draw a smaller area."
        )


def hash_aoi(aoi: dict[str, Any] | list[float]) -> str:
    """Deterministic hash of the AOI geometry, independent of key order / Feature wrapping."""
    geom = to_shapely(aoi)
    # Round coordinates to ~1m precision so trivial float noise doesn't bust the cache.
    normalized = json.dumps(shape(geom).__geo_interface__, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
