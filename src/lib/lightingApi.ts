export type LightingClassification = 'Normally lit' | 'Dimmer than usual' | 'Chronically under-lit' | 'Not evaluated - natural area';

export interface LightingCheckResponse {
  status: 'ok' | 'no_data';
  classification: LightingClassification;
  date_used?: string;
  radiance_value?: number;
  baseline_average?: number;
  is_baseline_seeded?: boolean;
  history?: Array<{
    date: string;
    radiance: number;
    is_seeded: boolean;
  }>;
  message: string;
}

export class LightingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LightingApiError';
  }
}

export async function checkLightingAdequacy(lat: number, lng: number): Promise<LightingCheckResponse> {
  const url = `http://localhost:8000/api/lighting/check?lat=${lat}&lng=${lng}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    let msg = 'Failed to check lighting activity.';
    try {
      const errData = await response.json();
      if (errData.detail) msg = errData.detail;
    } catch (e) {
      // ignore JSON parse error
    }
    throw new LightingApiError(msg);
  }

  return response.json();
}
