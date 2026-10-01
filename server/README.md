# UrbanInsight Construction Monitoring API

FastAPI backend for the Construction Activity Monitoring module. Detects new
built-up land within a user-drawn AOI by comparing NDBI (Normalized
Difference Built-up Index) between two Sentinel-2 L2A scenes.

## Run locally

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in SH_CLIENT_ID / SH_CLIENT_SECRET
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Endpoint

`POST /api/construction/check`

```json
{
  "aoi": { "type": "Polygon", "coordinates": [[[72.83,19.05],[72.84,19.05],[72.84,19.06],[72.83,19.06],[72.83,19.05]]] },
  "date_range": { "lookback_days": 60, "baseline_offset_days": 180, "max_cloud_cover": 20 }
}
```

`aoi` can also be a bounding box: `[minLon, minLat, maxLon, maxLat]`.

Results are cached in SQLite (`server/data/cache.db`) keyed by AOI hash +
the actual before/after acquisition dates, so repeat checks on the same
area/day don't re-hit Sentinel Hub. Pass `"force_refresh": true` to bypass
the cache.

## Architecture notes

- `app/services/sentinelhub_client.py` — OAuth2 client-credentials flow,
  Catalog API scene search, Processing API band/thumbnail fetches. Talks to
  the REST API directly via `httpx` (not the `sentinelhub-py` SDK) so the
  evalscripts stay fully explicit.
- `app/services/ndbi.py` — reads the returned GeoTIFFs, computes
  `NDBI_change`, thresholds it, vectorizes with `rasterio.features.shapes`,
  and derives the 0–100 activity score.
- `app/db.py` — SQLite cache behind a 2-function interface
  (`get_cached_result`/`set_cached_result`) designed to be swapped for a
  PostGIS-backed implementation later without touching the router.
