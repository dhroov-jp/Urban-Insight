// Real-time API integrations for urban data from backend

export interface BackendAQIResponse {
  status: string;
  aqi: number;
  station_name: string;
  distance_km: number;
  is_mock: boolean;
  message?: string;
}

export interface BackendTrafficResponse {
  status: string;
  congestion_percentage: number;
  current_speed: number;
  free_flow_speed: number;
  road_name: string;
  is_mock: boolean;
  message?: string;
}

export interface StaticLayersResponse {
  status: string;
  zone_name: string;
  population_density_2020: number;
  annual_crime_rate_2025: number;
  message?: string;
}

// Air Quality API (WAQI) via backend
export async function fetchAQI(lat: number, lng: number): Promise<BackendAQIResponse> {
  const res = await fetch(`/api/urban/aqi?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    throw new Error(`AQI API HTTP error ${res.status}`);
  }
  return res.json();
}

// Traffic Congestion API (TomTom) via backend
export async function fetchTrafficFlowTomTom(lat: number, lng: number): Promise<BackendTrafficResponse> {
  const res = await fetch(`/api/urban/traffic?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    throw new Error(`Traffic API HTTP error ${res.status}`);
  }
  return res.json();
}

// Static Layers (Population density, Crime hotspots) via database
export async function fetchStaticLayers(lat: number, lng: number): Promise<StaticLayersResponse> {
  const res = await fetch(`/api/urban/static-layers?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    throw new Error(`Static layers API HTTP error ${res.status}`);
  }
  return res.json();
}

// Mock population density (using known Mumbai reference data)
export const POPULATION_DENSITY_REFERENCE: Record<string, number> = {
  'Dharavi': 300000,
  'Bandra': 40000,
  'Andheri': 35000,
  'Powai': 12000,
  'Colaba': 18000,
  'Kurla': 28000,
  'Dadar': 45000,
  'Fort': 22000,
  'Mahim': 25000,
  'Sion': 32000,
  'Saki Naka': 24000,
  'Mankhurd': 15000,
  'Govandi': 18000,
  'Santacruz': 20000,
  'Goregaon': 16000,
  'Wadala': 19000,
  'IIT Bombay': 5000,
  'Powai Lake': 2000,
  'Carter Road': 8000,
  'BKC': 50000,
  'MIDC': 35000,
  'Gateway Area': 45000,
  'Chunabhatti': 28000,
};

// AI-powered insight generation via Claude API
export async function generateAIInsight(
  layer: string,
  topHotspots: Array<{ label: string; value: number }>,
  apiKey: string
): Promise<string | null> {
  try {
    const hotspotsText = topHotspots
      .slice(0, 5)
      .map((h, i) => `${i + 1}. ${h.label}: ${h.value}`)
      .join('\n');

    const layerContext: Record<string, string> = {
      traffic: 'Traffic Congestion (% blockage)',
      pollution: 'Air Quality Index (AQI 0-500)',
      population: 'Population Density (per km²)',
      crime: 'Crime Risk Index (per 10,000 pop)',
    };

    const prompt = `You are an urban analytics AI for Mumbai smart city operations.
    
Layer: ${layer} (${layerContext[layer] || 'Unknown'})

Top 5 Hotspots:
${hotspotsText}

Provide a 2-sentence actionable insight:
1. Describe the pattern/trend you observe
2. Suggest ONE specific city planning or operational action

Keep response concise and actionable.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error('Claude API error:', res.statusText);
      return null;
    }

    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (error) {
    console.error('AI Insight generation error:', error);
    return null;
  }
}

// Generate full executive report
export async function generateExecutiveReport(
  layers: Array<{ name: string; topHotspots: Array<{ label: string; value: number }> }>,
  apiKey: string
): Promise<string | null> {
  try {
    const layerSummaries = layers
      .map(
        (l) =>
          `${l.name}: Top hotspots are ${l.topHotspots
            .slice(0, 3)
            .map((h) => h.label)
            .join(', ')}`
      )
      .join('\n');

    const prompt = `Generate a 4-sentence executive summary for Mumbai's urban operations center covering all layers:

${layerSummaries}

Format: Clear, actionable, suitable for city officials.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (error) {
    console.error('Report generation error:', error);
    return null;
  }
}
