"""
Thin async client for the Copernicus Data Space Ecosystem's Sentinel Hub
APIs: OAuth2 client-credentials auth, Catalog search (find scenes), and
Processing API (fetch band data / thumbnails).

We talk to the REST API directly with httpx rather than the sentinelhub-py
SDK so the evalscripts (band math) stay fully explicit and easy to audit —
the SDK mainly saves boilerplate we don't have much of here. Swapping to
sentinelhub-py later is straightforward if you'd rather use its request
builders / rate-limit handling.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from ..config import settings

# Evalscript producing a 2-band float32 GeoTIFF: [NDBI, NDVI]
# B11 = SWIR1 (20m, resampled to output res), B08 = NIR, B04 = Red
NDBI_NDVI_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "B11", "dataMask"],
    output: { bands: 3, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(s) {
  let ndbi = (s.B11 - s.B08) / (s.B11 + s.B08 + 1e-6);
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-6);
  return [ndbi, ndvi, s.dataMask];
}
"""

TRUE_COLOR_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: ["B04", "B03", "B02"],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  const gain = 2.5;
  return [s.B04 * gain, s.B03 * gain, s.B02 * gain];
}
"""


class SentinelHubError(RuntimeError):
    pass


class SentinelHubAuthError(SentinelHubError):
    pass


@dataclass
class _TokenCache:
    access_token: str = ""
    expires_at: float = 0.0


_token_cache = _TokenCache()


async def get_access_token(client: httpx.AsyncClient) -> str:
    """Client-credentials OAuth2 flow, with a small in-memory cache so we
    don't request a new token on every API call."""
    if not settings.SH_CLIENT_ID or not settings.SH_CLIENT_SECRET:
        raise SentinelHubAuthError(
            "SH_CLIENT_ID / SH_CLIENT_SECRET are not set. Add Copernicus Data Space Ecosystem "
            "OAuth credentials to server/.env (see .env.example)."
        )

    if _token_cache.access_token and time.time() < _token_cache.expires_at - 30:
        return _token_cache.access_token

    resp = await client.post(
        settings.SH_TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.SH_CLIENT_ID.strip(),
            "client_secret": settings.SH_CLIENT_SECRET.strip(),
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        raise SentinelHubAuthError(f"OAuth token request failed ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    _token_cache.access_token = data["access_token"]
    _token_cache.expires_at = time.time() + data.get("expires_in", 300)
    return _token_cache.access_token


async def _auth_headers(client: httpx.AsyncClient) -> dict[str, str]:
    token = await get_access_token(client)
    return {"Authorization": f"Bearer {token}"}


async def find_best_scene(
    client: httpx.AsyncClient,
    bbox: list[float],
    date_from: str,
    date_to: str,
    max_cloud_cover: float,
) -> Optional[dict[str, Any]]:
    """Query the Catalog API for Sentinel-2 L2A scenes over the AOI/date window,
    returning the least-cloudy scene, or None if nothing cloud-free enough is found."""
    headers = await _auth_headers(client)
    body = {
        "collections": ["sentinel-2-l2a"],
        "datetime": f"{date_from}T00:00:00Z/{date_to}T23:59:59Z",
        "bbox": bbox,
        "limit": 50,
        "filter": f"eo:cloud_cover < {max_cloud_cover}",
        "filter-lang": "cql2-text",
        "fields": {
            "include": ["id", "properties.datetime", "properties.eo:cloud_cover"],
            "exclude": [],
        },
    }
    resp = await client.post(settings.SH_CATALOG_URL, json=body, headers=headers)
    if resp.status_code != 200:
        raise SentinelHubError(f"Catalog search failed ({resp.status_code}): {resp.text[:300]}")

    features = resp.json().get("features", [])
    if not features:
        return None

    features.sort(key=lambda f: f["properties"].get("eo:cloud_cover", 100))
    best = features[0]
    return {
        "scene_id": best["id"],
        "date": best["properties"]["datetime"][:10],
        "cloud_cover": best["properties"].get("eo:cloud_cover", -1),
    }


async def fetch_ndbi_ndvi_tiff(
    client: httpx.AsyncClient,
    bbox: list[float],
    date: str,
    width: int,
    height: int,
) -> bytes:
    """Fetch a 3-band float32 GeoTIFF (NDBI, NDVI, dataMask) for the AOI on a given date,
    via the Processing API, in EPSG:4326 so pixel<->lon/lat mapping is a simple affine transform."""
    headers = await _auth_headers(client)
    headers["Accept"] = "image/tiff"
    body = {
        "input": {
            "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": f"{date}T00:00:00Z", "to": f"{date}T23:59:59Z"},
                        "mosaickingOrder": "leastCC",
                    },
                }
            ],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}],
        },
        "evalscript": NDBI_NDVI_EVALSCRIPT,
    }
    resp = await client.post(settings.SH_PROCESS_URL, json=body, headers=headers)
    if resp.status_code != 200:
        raise SentinelHubError(f"Processing API (NDBI/NDVI) failed ({resp.status_code}): {resp.text[:300]}")
    return resp.content


async def fetch_true_color_png(
    client: httpx.AsyncClient,
    bbox: list[float],
    date: str,
    width: int,
    height: int,
) -> bytes:
    """Fetch a true-color PNG thumbnail for the AOI on a given date."""
    headers = await _auth_headers(client)
    headers["Accept"] = "image/png"
    body = {
        "input": {
            "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": f"{date}T00:00:00Z", "to": f"{date}T23:59:59Z"},
                        "mosaickingOrder": "leastCC",
                    },
                }
            ],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": TRUE_COLOR_EVALSCRIPT,
    }
    resp = await client.post(settings.SH_PROCESS_URL, json=body, headers=headers)
    if resp.status_code != 200:
        raise SentinelHubError(f"Processing API (thumbnail) failed ({resp.status_code}): {resp.text[:300]}")
    return resp.content
