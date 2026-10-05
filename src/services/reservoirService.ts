export type ReservoirSourceStatus = 'live' | 'cached' | 'unavailable';

export interface ReservoirReading {
  reservoirName: string;
  storageML: number;
  capacityML: number;
  percentage: number;
  waterLevel: number | null;
  rainfall24h: number | null;
  rainfallSeason: number | null;
  change24h: number | null;
  status: 'Healthy' | 'Moderate' | 'Watch' | 'Critical';
  lastUpdated: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
}

export interface ReservoirSummary {
  source: string;
  sourceUrl: string;
  sourceStatus: ReservoirSourceStatus;
  error: string | null;
  lastUpdated: string | null;
  daysSinceUpdate: number;
  dailyDemandML: number;
  totalUsefulStorageML: number;
  totalUsefulCapacityML: number;
  overallUsefulStoragePercent: number;
  daysOfSupply: number;
  readings: ReservoirReading[];
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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail || `Reservoir request failed: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function fetchLatestReservoirData(): Promise<ReservoirSummary> {
  return request<ReservoirSummary>('/api/reservoirs/current');
}

export function fetchReservoirHistory(lake?: string, days = 90): Promise<HistoricalReading[]> {
  const url = lake
    ? `/api/reservoirs/history?lake=${encodeURIComponent(lake)}&days=${days}`
    : `/api/reservoirs/history?days=${days}`;
  return request<HistoricalReading[]>(url);
}

export function fetchOverflowEvents(lake?: string): Promise<OverflowEvent[]> {
  const url = lake
    ? `/api/reservoirs/overflow-events?lake=${encodeURIComponent(lake)}`
    : '/api/reservoirs/overflow-events';
  return request<OverflowEvent[]>(url);
}

export function refreshReservoirData(): Promise<{ status: string; message: string; data: ReservoirSummary }> {
  return request('/api/reservoirs/scrape', { method: 'POST' });
}
