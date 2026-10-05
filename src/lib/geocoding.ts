export interface GeocodingResult {
  placeId: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export async function geocodeLocation(
  query: string,
  signal?: AbortSignal,
  limit = 5,
): Promise<GeocodingResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const params = new URLSearchParams({
    q: trimmedQuery,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
  });

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    signal,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      Referer: window.location.origin,
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding service returned HTTP ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];
  return results.map((result) => ({
    placeId: String(result.place_id),
    displayName: result.display_name,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
  }));
}
