from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class DateRangeInput(BaseModel):
    """Optional explicit overrides for the two search windows.

    If omitted entirely, the backend searches the most recent cloud-free
    scene within `lookback_days` for "after", and a cloud-free scene near
    `baseline_offset_days` before that for "before".
    """
    lookback_days: int = Field(default=60, ge=1, le=365)
    baseline_offset_days: int = Field(default=180, ge=7, le=1095)
    baseline_window_days: int = Field(default=45, ge=1, le=180)
    max_cloud_cover: float = Field(default=20.0, ge=0, le=100)


class ConstructionCheckRequest(BaseModel):
    """Input for POST /api/construction/check.

    `aoi` accepts either a GeoJSON Polygon/Feature geometry, or a bounding
    box as [minLon, minLat, maxLon, maxLat].
    """
    aoi: dict[str, Any] | list[float] = Field(
        ..., description="GeoJSON Polygon geometry/Feature, or [minLon, minLat, maxLon, maxLat] bbox"
    )
    date_range: Optional[DateRangeInput] = None
    ndbi_change_threshold: Optional[float] = Field(default=None, ge=0, le=1)
    force_refresh: bool = Field(default=False, description="Skip cache and re-run the analysis")

    @field_validator("aoi")
    @classmethod
    def validate_aoi(cls, v):
        if isinstance(v, list):
            if len(v) != 4:
                raise ValueError("bbox AOI must be [minLon, minLat, maxLon, maxLat]")
            return v
        if isinstance(v, dict):
            geom = v.get("geometry", v)  # unwrap Feature if needed
            if geom.get("type") not in ("Polygon", "MultiPolygon"):
                raise ValueError("GeoJSON AOI must be a Polygon or MultiPolygon (or a Feature wrapping one)")
            return v
        raise ValueError("aoi must be a GeoJSON geometry/Feature or a 4-element bbox")


class SceneInfo(BaseModel):
    date: str
    cloud_cover: float
    scene_id: str


class ChangeStats(BaseModel):
    change_area_m2: float
    change_area_pct_of_aoi: float
    mean_ndbi_change: float
    max_ndbi_change: float
    polygon_count: int


class ConstructionCheckResponse(BaseModel):
    aoi_hash: str
    cached: bool
    status: Literal["ok", "no_scenes_found"]
    score: float = Field(description="0-100 construction activity score for the AOI")
    change_geojson: dict[str, Any]
    stats: Optional[ChangeStats] = None
    before_scene: Optional[SceneInfo] = None
    after_scene: Optional[SceneInfo] = None
    before_thumbnail_url: Optional[str] = None
    after_thumbnail_url: Optional[str] = None
    message: Optional[str] = None


from enum import Enum

class LightingClassification(str, Enum):
    NORMAL = "Normally lit"
    DIMMER = "Dimmer than usual"
    CHRONIC = "Chronically under-lit"
    NOT_EVALUATED = "Not evaluated - natural area"

class LightingCheckResponse(BaseModel):
    status: Literal["ok", "no_data"]
    classification: LightingClassification
    date_used: Optional[str] = None
    radiance_value: Optional[float] = None
    baseline_average: Optional[float] = None
    is_baseline_seeded: bool = False
    history: list[dict] = []
    message: str = "Based on satellite pass: N/A · ~500m resolution · compared to this area's 90-day average"

