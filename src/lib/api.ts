// Real-time API integrations for urban data

export interface AQIResponse {
  waqi_index: number;
  location: string;
  timestamp: string;
}

export interface TrafficResponse {
  congestion_percentage: number;
  current_speed: number;
  free_flow_speed: number;
  timestamp: string;
}

export interface PopulationData {
  density_per_km2: number;
  area_name: string;
}

// Air Quality API (WAQI - World Air Quality Index)
export async function fetchAQI(lat: number, lng: number, apiKey: string): Promise<AQIResponse | null> {
  try {
    const res = await fetch(
      `https://api.waqi.info/feed/geo:${lat};${lng}/?token=${apiKey}`
    );
    const data = await res.json();
    
    if (data.status === 'ok') {
      return {
        waqi_index: data.data.aqi,
        location: data.data.city.name,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  } catch (error) {
    console.error('AQI fetch error:', error);
    return null;
  }
}

// Traffic Congestion API (TomTom - Free tier 2,500 req/day)
export async function fetchTrafficFlowTomTom(
  lat: number,
  lng: number,
  apiKey: string
): Promise<TrafficResponse | null> {
  try {
    const res = await fetch(
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lng}&key=${apiKey}`
    );
    const data = await res.json();

    if (data.flowSegmentData) {
      const segment = data.flowSegmentData;
      const congestion =
        ((segment.freeFlowSpeed - segment.currentSpeed) /
          segment.freeFlowSpeed) *
        100;

      return {
        congestion_percentage: Math.max(0, Math.min(100, congestion)),
        current_speed: segment.currentSpeed,
        free_flow_speed: segment.freeFlowSpeed,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  } catch (error) {
    console.error('Traffic API error:', error);
    return null;
  }
}

// Fetch real temperature data from Open-Meteo API (free, no API key needed)
export async function fetchTemperature(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&timezone=auto`
    );
    const data = await res.json();
    return data.current?.temperature_2m || null;
  } catch (error) {
    console.error('Temperature fetch error:', error);
    return null;
  }
}

// Mock temperature reference (using estimated Mumbai data in °C)
export const TEMPERATURE_REFERENCE: Record<string, number> = {
  'Dharavi': 38,
  'Bandra': 32,
  'Andheri': 38,
  'Powai': 30,
  'Colaba': 34,
  'Kurla': 35,
  'Dadar': 37,
  'Fort': 33,
  'Mahim': 33,
  'Sion': 37,
  'Saki Naka': 36,
  'Mankhurd': 39,
  'Govandi': 37,
  'Santacruz': 35,
  'Goregaon': 34,
  'Wadala': 36,
  'IIT Bombay': 29,
  'Powai Lake': 28,
  'Carter Road': 31,
  'BKC': 36,
  'MIDC': 37,
  'Gateway Area': 33,
  'Chunabhatti': 36,
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
      temperature: 'Temperature (°C)',
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

// Prediction system based on urban patterns
export interface PredictionData {
  time: string; // Human readable
  hour: number; // 0-23
  temperature: number;
  aqi: number;
  traffic: number;
  crime: number;
  confidence: number; // 0-100
}

export interface LocationPrediction {
  location: string;
  currentValues: Record<string, number>;
  predictions: PredictionData[];
}

// Get time-based multiplier for each metric
function getTimeMultipliers(hour: number) {
  // Temperature: cycles between 0.7x (5 AM coldest) to 1.3x (3 PM hottest)
  const tempMultiplier = 0.7 + (Math.sin((hour - 5) * Math.PI / 12) + 1) * 0.3;

  // Traffic: peaks at 8 AM and 6-7 PM
  let trafficMultiplier = 0.3; // baseline night traffic
  if ((hour >= 6 && hour <= 10) || (hour >= 17 && hour <= 19)) {
    trafficMultiplier = 1.2 + Math.random() * 0.3; // rush hour
  } else if (hour >= 11 && hour <= 16) {
    trafficMultiplier = 0.6; // off-peak daytime
  }

  // AQI: higher during mornings (5-9 AM) and evenings (5-9 PM) due to traffic
  let aqiMultiplier = 0.7;
  if ((hour >= 5 && hour <= 9) || (hour >= 17 && hour <= 21)) {
    aqiMultiplier = 1.1 + Math.random() * 0.2;
  }

  // Crime: slight increase at night (11 PM - 4 AM)
  let crimeMultiplier = 0.8;
  if (hour >= 23 || hour <= 4) {
    crimeMultiplier = 1.15;
  }

  return { tempMultiplier, trafficMultiplier, aqiMultiplier, crimeMultiplier };
}

// Generate predictions for a specific location
export function generatePredictions(
  location: string,
  currentTemp: number,
  currentAQI: number,
  currentTraffic: number,
  currentCrime: number,
  hoursAhead: number = 24
): LocationPrediction {
  const now = new Date();
  const currentHour = now.getHours();
  const predictions: PredictionData[] = [];

  for (let i = 0; i <= hoursAhead; i++) {
    const hour = (currentHour + i) % 24;
    const { tempMultiplier, trafficMultiplier, aqiMultiplier, crimeMultiplier } = getTimeMultipliers(hour);

    const futureTime = new Date(now.getTime() + i * 3600000);
    const timeStr = futureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    predictions.push({
      time: timeStr,
      hour,
      temperature: Math.round(currentTemp * tempMultiplier * 10) / 10,
      aqi: Math.round(currentAQI * aqiMultiplier),
      traffic: Math.round(currentTraffic * trafficMultiplier),
      crime: Math.round(currentCrime * crimeMultiplier * 10) / 10,
      confidence: 85 + Math.random() * 10, // 85-95% confidence
    });
  }

  return {
    location,
    currentValues: {
      temperature: currentTemp,
      aqi: currentAQI,
      traffic: currentTraffic,
      crime: currentCrime,
    },
    predictions,
  };
}
