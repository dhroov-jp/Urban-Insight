// API client for the Live Reservoir & Lake Stock Tracker module.
// The base URL is proxied through Vite (see vite.config.ts `server.proxy`)
// or points to VITE_API_BASE_URL.

export interface LakeReading {
  lake_name: string;
  latitude: number;
  longitude: number;
  full_capacity_ml: number;
  date: string;
  percent_stock: number;
  content_ml: number;
  rainfall_mm_24hr: number;
  source_url: string;
}

export interface ReservoirSummary {
  last_updated: string;
  days_since_update: number;
  demand_ml_day: number;
  total_content_ml: number;
  total_capacity_ml: number;
  combined_percent_stock: number;
  days_of_supply_remaining: number;
  readings: LakeReading[];
}

export interface HistoricalReading {
  date: string;
  percent_stock: number;
  content_ml: number;
  rainfall_mm_24hr: number;
}

export interface OverflowEvent {
  lake_name: string;
  year: number;
  overflow_date: string;
}

export async function fetchReservoirCurrent(): Promise<ReservoirSummary> {
  const res = await fetch(`/api/reservoirs/current`);
  if (!res.ok) {
    throw new Error(`Failed to fetch current reservoir status: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReservoirHistory(lake?: string, days = 90): Promise<HistoricalReading[]> {
  const url = lake
    ? `/api/reservoirs/history?lake=${encodeURIComponent(lake)}&days=${days}`
    : `/api/reservoirs/history?days=${days}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch historical reservoir data: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchOverflowEvents(lake?: string): Promise<OverflowEvent[]> {
  const url = lake
    ? `/api/reservoirs/overflow-events?lake=${encodeURIComponent(lake)}`
    : `/api/reservoirs/overflow-events`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch overflow events: ${res.statusText}`);
  }
  return res.json();
}

export async function triggerManualScrape(): Promise<any> {
  const res = await fetch(`/api/reservoirs/scrape`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Failed to trigger manual scrape`);
  }
  return res.json();
}
