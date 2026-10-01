// API client for the Construction Activity Monitoring module.
// Talks to the FastAPI backend in /server — see server/README.md to run it.
// The base URL is proxied through Vite (see vite.config.ts `server.proxy`)
// so this hits `/api/...` in dev and prod alike; no API keys are ever
// exposed client-side (Sentinel Hub credentials live only in server/.env).

export interface DateRangeOptions {
  lookback_days?: number;
  baseline_offset_days?: number;
  baseline_window_days?: number;
  max_cloud_cover?: number;
}

export interface SceneInfo {
  date: string;
  cloud_cover: number;
  scene_id: string;
}

export interface ChangeStats {
  change_area_m2: number;
  change_area_pct_of_aoi: number;
  mean_ndbi_change: number;
  max_ndbi_change: number;
  polygon_count: number;
}

export interface ConstructionCheckResponse {
  aoi_hash: string;
  cached: boolean;
  status: 'ok' | 'no_scenes_found';
  score: number;
  change_geojson: GeoJSON.FeatureCollection;
  stats?: ChangeStats;
  before_scene?: SceneInfo;
  after_scene?: SceneInfo;
  before_thumbnail_url?: string;
  after_thumbnail_url?: string;
  message?: string;
}

export interface ConstructionCheckOptions {
  dateRange?: DateRangeOptions;
  ndbiChangeThreshold?: number;
  forceRefresh?: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export class ConstructionApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ConstructionApiError';
    this.status = status;
  }
}

// aoi: GeoJSON Polygon geometry (from leaflet-draw), or a [minLon, minLat, maxLon, maxLat] bbox
export async function checkConstructionActivity(
  aoi: GeoJSON.Polygon | [number, number, number, number],
  options: ConstructionCheckOptions = {}
): Promise<ConstructionCheckResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/construction/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aoi,
        date_range: options.dateRange,
        ndbi_change_threshold: options.ndbiChangeThreshold,
        force_refresh: options.forceRefresh ?? false,
      }),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new ConstructionApiError(
        detail?.detail || `Construction check failed (${res.status})`,
        res.status
      );
    }

    return await res.json();
  } catch (error) {
    if (error instanceof ConstructionApiError) throw error;
    console.error('Construction activity check error:', error);
    throw new ConstructionApiError('Could not reach the construction monitoring service.');
  }
}

// Resolves a thumbnail path returned by the backend (e.g. "/static/thumbnails/xyz.png")
// into an absolute URL against the API host.
export function resolveThumbnailUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}
