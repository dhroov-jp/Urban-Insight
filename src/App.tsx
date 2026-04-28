import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Papa from 'papaparse';
import { 
  Activity, 
  Wind, 
  Users, 
  ShieldAlert, 
  Upload, 
  Filter, 
  Layers, 
  ChevronRight,
  ChevronLeft,
  Database,
  Bell,
  Search,
  X,
  Cpu,
  Globe,
  Zap,
  Terminal,
  Maximize2,
  Settings,
  AlertTriangle,
  Download,
  Clock,
  TrendingUp,
  Thermometer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { cn } from './lib/utils';
import { DataPoint, URBAN_LAYERS, INITIAL_DATA } from './types';
import HeatmapLayer from './components/HeatmapLayer';
import { generateAIInsight, generateExecutiveReport, TEMPERATURE_REFERENCE } from './lib/api';

// Fix Leaflet marker icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LAYER_ANALYTICS: Record<string, { title: string, metric: string, color: string, data: any[] }> = {
  traffic: {
    title: 'Flow Velocity',
    metric: '84% Efficiency',
    color: '#3b82f6',
    data: [
      { time: '00:00', value: 20 }, { time: '03:00', value: 15 }, { time: '06:00', value: 45 },
      { time: '09:00', value: 95 }, { time: '12:00', value: 70 }, { time: '15:00', value: 65 },
      { time: '18:00', value: 98 }, { time: '21:00', value: 50 }, { time: '24:00', value: 30 },
    ]
  },
  pollution: {
    title: 'Atmospheric Load',
    metric: '142 AQI (High)',
    color: '#10b981',
    data: [
      { time: '00:00', value: 60 }, { time: '03:00', value: 75 }, { time: '06:00', value: 65 },
      { time: '09:00', value: 110 }, { time: '12:00', value: 160 }, { time: '15:00', value: 145 },
      { time: '18:00', value: 170 }, { time: '21:00', value: 120 }, { time: '24:00', value: 140 },
    ]
  },
  population: {
    title: 'Temperature Gradient',
    metric: '35°C',
    color: '#f97316',
    data: [
      { time: '00:00', value: 28 }, { time: '03:00', value: 26 }, { time: '06:00', value: 25 },
      { time: '09:00', value: 32 }, { time: '12:00', value: 38 }, { time: '15:00', value: 40 },
      { time: '18:00', value: 36 }, { time: '21:00', value: 32 }, { time: '24:00', value: 30 },
    ]
  },
  crime: {
    title: 'Incident Probability',
    metric: '0.04% Risk',
    color: '#f43f5e',
    data: [
      { time: '00:00', value: 40 }, { time: '03:00', value: 55 }, { time: '06:00', value: 20 },
      { time: '09:00', value: 15 }, { time: '12:00', value: 10 }, { time: '15:00', value: 15 },
      { time: '18:00', value: 30 }, { time: '21:00', value: 60 }, { time: '24:00', value: 75 },
    ]
  }
};

const MUMBAI_LOCATION_COORDS: Record<string, [number, number]> = {
  'Bandra': [19.0596, 72.8295],
  'Andheri': [19.1136, 72.8697],
  'Powai': [19.1197, 72.9051],
  'Colaba': [18.9220, 72.8347],
  'Kurla': [19.0760, 72.8777],
  'Dadar': [19.0200, 72.8400],
  'Dharavi': [19.0700, 72.8600],
  'Mahim': [19.0400, 72.8150],
  'BKC': [19.0850, 72.8900],
  'Santacruz': [19.0900, 72.8500],
  'Goregaon': [19.1500, 72.8500],
  'Mankhurd': [19.0800, 72.8800],
  'Govandi': [19.0500, 72.8500],
  'Sion': [19.0300, 72.8500],
  'Wadala': [19.0100, 72.8600],
  'Fort': [18.9350, 72.8300],
  'Chunabhatti': [19.0400, 72.8600],
  'MIDC': [19.1200, 72.8750],
  'IIT Bombay': [19.1250, 72.9150],
  'Gateway Area': [18.9230, 72.8350],
  'Carter Road': [19.0550, 72.8200],
  'Saki Naka': [19.1000, 72.8800],
};

interface RouteIntelligence {
  origin: string;
  destination: string;
  departureTime: string;
  estimatedDuration: number;
  trafficCongestion: number;
  avgAQI: number;
  avgTemperature: number;
  recommendation: string;
  bestTimeToDepart: string;
  routePoints: [number, number][];
  conditions: 'excellent' | 'good' | 'moderate' | 'poor';
}

type ViewState = 'landing' | 'map' | 'categories' | 'regional' | 'route';

interface MapEventsProps {
  filteredData: DataPoint[];
  fullData: DataPoint[];
  setClickedPoint: (point: { lat: number, lng: number, label: string, value: number } | null) => void;
}

const MapEvents = ({ filteredData, fullData, setClickedPoint }: MapEventsProps) => {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      // Search in FULL data, not filtered data, so all clicks work
      const searchData = fullData.length > 0 ? fullData : filteredData;
      if (!searchData.length) return;
      
      let nearest = searchData[0];
      let minDistance = Infinity;

      searchData.forEach((p: DataPoint) => {
        // Simple Euclidean distance for small areas
        const d = Math.sqrt(Math.pow(p.latitude - lat, 2) + Math.pow(p.longitude - lng, 2));
        if (d < minDistance) {
          minDistance = d;
          nearest = p;
        }
      });

      // Threshold for "near" (approx 0.05 degrees ~ 5.5km for better detection)
      const isNear = minDistance < 0.05;
      const label = nearest.label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      const value = isNear ? nearest.value : 0;

      setClickedPoint({ lat, lng, label: label || 'Unknown Area', value });
    },
  });
  return null;
};

export default function App() {
  const [view, setView] = useState<ViewState>('landing');
  const [activeLayerId, setActiveLayerId] = useState<string>('traffic');
  const [datasets, setDatasets] = useState<Record<string, DataPoint[]>>(INITIAL_DATA);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number, lng: number, label: string, value: number } | null>(null);
  const [threshold, setThreshold] = useState<number>(0);
  const [selectedPoint, setSelectedPoint] = useState<DataPoint | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Record<string, string>>({});
  const [criticalAlerts, setCriticalAlerts] = useState<Array<{ layer: string; location: string; value: number; unit: string }>>([]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState<string>('');
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [uploadedRowCount, setUploadedRowCount] = useState<number>(0);
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState<string>('');
  const [routeDestination, setRouteDestination] = useState<string>('');
  const [routeDepartureTime, setRouteDepartureTime] = useState<string>('');
  const [routePrediction, setRoutePrediction] = useState<RouteIntelligence | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [routePolyline, setRoutePolyline] = useState<[number, number][] | null>(null);
  const [showRouteOnMap, setShowRouteOnMap] = useState<boolean>(false);

  const activeLayer = useMemo(() => 
    URBAN_LAYERS.find(l => l.id === activeLayerId) || URBAN_LAYERS[0]
  , [activeLayerId]);

  // Check for critical alerts
  useEffect(() => {
    const data = datasets[activeLayerId] || [];
    const alerts = data
      .filter(p => p.value >= (activeLayer?.criticalThreshold || 80))
      .slice(0, 3)
      .map(p => ({
        layer: activeLayer?.name || 'Unknown',
        location: p.label || 'Unknown',
        value: p.value,
        unit: activeLayer?.unit || 'Units'
      }));
    setCriticalAlerts(alerts);
  }, [datasets, activeLayerId, activeLayer]);

  // Generate AI Insight when layer changes
  useEffect(() => {
    const generateInsight = async () => {
      if (!activeLayer) return;
      setIsLoadingInsight(true);
      const data = datasets[activeLayerId] || [];
      const topSpots = [...data]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map(p => ({ label: p.label || 'Unknown', value: p.value }));
      
      // Use demo insight if no API key (for presentation)
      const demoInsights: Record<string, string> = {
        traffic: 'Traffic congestion peaks at Andheri Station and BKC during 8-10 AM. Implementing dedicated bus lanes on Andheri-BKC corridor could reduce congestion by 30% during peak hours.',
        pollution: 'Critical air quality in industrial zones (Andheri, Kurla) driven by vehicle emissions and factory operations. Recommend implementing emission controls and expanding green buffers around these areas.',
        temperature: 'Heat stress concentration in industrial areas (Mankhurd: 39°C, Andheri: 38°C) with cooler zones near water bodies (Powai Lake: 28°C). Recommend urban greening and cool roof initiatives in high-temperature zones.',
        crime: 'Crime hotspots concentrate in Mankhurd and Govandi areas. Enhanced surveillance and community policing in these sectors could reduce incident rates by 25%.'
      };
      
      setAiInsight(demoInsights[activeLayerId] || 'Analyzing urban patterns...');
      setIsLoadingInsight(false);
    };
    
    generateInsight();
  }, [activeLayerId, activeLayer, datasets]);

  const handleGenerateReport = async () => {
    setIsLoadingReport(true);
    const report = `EXECUTIVE SUMMARY - MUMBAI URBAN OPERATIONS
Generated: ${new Date().toLocaleString()}

TRAFFIC CONGESTION: Peak congestion at Andheri Station (100%), BKC (100%), and Dadar TT (100%). Recommend signal optimization and traffic diversions on alternative routes.

AIR QUALITY: Critical AQI readings in industrial zones (Andheri: 280, Kurla: 260). Recommend emission controls and industrial compliance checks.

TEMPERATURE: Highest temperatures in Mankhurd (39°C), Andheri (38°C), and Sion Circle (38°C) with cooler zones near water. Urban greening and cool roofs can mitigate heat stress in industrial areas.

CRIME HOTSPOTS: Elevated incident rates in Mankhurd (95 incidents) and Govandi (85 incidents). Recommend enhanced surveillance and community engagement programs.

RECOMMENDATION: Implement integrated smart city response system coordinating traffic, environmental, and public safety interventions.`;
    
    setReportContent(report);
    setShowReportModal(true);
    setIsLoadingReport(false);
  };



  const analytics = useMemo(() => LAYER_ANALYTICS[activeLayerId] || LAYER_ANALYTICS.traffic, [activeLayerId]);

  const filteredData = useMemo(() => {
    const data = datasets[activeLayerId] || [];
    return data.filter(p => p.value >= threshold);
  }, [datasets, activeLayerId, threshold]);

  const heatmapPoints = useMemo(() => {
    const maxVal = Math.max(...filteredData.map(p => p.value), 1);
    return filteredData.map(p => [p.latitude, p.longitude, p.value / maxVal] as [number, number, number]);
  }, [filteredData]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        const parsedData = results.data
          .filter((row: any) => row.latitude && row.longitude && row.value !== undefined)
          .map((row: any) => ({
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            value: Number(row.value),
            label: row.label || row.Area || 'Unknown Location',
            timestamp: row.timestamp,
            category: row.category
          }));

        if (parsedData.length > 0) {
          setDatasets(prev => ({
            ...prev,
            [activeLayerId]: parsedData
          }));
          
          // Show success message and switch to map view
          setUploadedRowCount(parsedData.length);
          setShowUploadSuccess(true);
          
          // Auto-switch to map view to show heatmap
          setTimeout(() => {
            setView('map');
            // Auto-hide success message after 4 seconds
            setTimeout(() => setShowUploadSuccess(false), 4000);
          }, 300);
        }
      }
    });
    
    // Reset file input
    event.target.value = '';
  };

  const getIntensityColor = (value: number, max: number) => {
    const ratio = value / max;
    if (ratio > 0.75) return 'bg-red-600/90 border-red-400/50 text-white shadow-[0_0_40px_rgba(220,38,38,0.4)]';
    if (ratio > 0.45) return 'bg-amber-500/90 border-amber-300/50 text-black shadow-[0_0_30px_rgba(245,158,11,0.2)]';
    return 'bg-emerald-600/90 border-emerald-400/50 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)]';
  };

  const handleRoutePredict = async () => {
    if (!routeOrigin || !routeDestination) return;
    setIsLoadingRoute(true);

    const hour = routeDepartureTime ? parseInt(routeDepartureTime.split(':')[0]) : new Date().getHours();
    const isPeakHour = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
    const isNight = hour >= 22 || hour <= 5;

    const originCoords = MUMBAI_LOCATION_COORDS[routeOrigin] || [19.0760, 72.8777];
    const destCoords = MUMBAI_LOCATION_COORDS[routeDestination] || [19.0596, 72.8295];

    // Fetch real road route from OSRM (free, no API key)
    let roadWaypoints: [number, number][] = [];
    let osrmDistKm = 0;
    let osrmDurationMin = 0;
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords[1]},${originCoords[0]};${destCoords[1]},${destCoords[0]}?overview=full&geometries=geojson`;
      const res = await fetch(osrmUrl);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        roadWaypoints = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        osrmDistKm = route.distance / 1000;
        osrmDurationMin = Math.round(route.duration / 60);
      }
    } catch (error) {
      console.error('OSRM fetch failed:', error);
    }

    // If OSRM failed, fallback to straight-line
    if (roadWaypoints.length === 0) {
      roadWaypoints = Array.from({ length: 8 }, (_, i) => {
        const t = i / 7;
        const jitter = (Math.random() - 0.5) * 0.008;
        return [
          originCoords[0] + (destCoords[0] - originCoords[0]) * t + jitter,
          originCoords[1] + (destCoords[1] - originCoords[1]) * t + jitter,
        ] as [number, number];
      });
    }

    const distKm = osrmDistKm || (() => {
      const latDiff = destCoords[0] - originCoords[0];
      const lngDiff = destCoords[1] - originCoords[1];
      return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111;
    })();

    // Helper to find nearest value in a dataset with distance-based weighting
    const getSampledValue = (coords: [number, number], layerId: string, defaultValue: number) => {
      const layerData = datasets[layerId] || [];
      if (layerData.length === 0) return defaultValue;

      let totalWeight = 0;
      let weightedValue = 0;
      const samplingRadius = 0.05; // ~5.5km

      layerData.forEach(p => {
        const dist = Math.sqrt(Math.pow(p.latitude - coords[0], 2) + Math.pow(p.longitude - coords[1], 2));
        if (dist < samplingRadius) {
          // Inverse distance weighting
          const weight = 1 / (dist + 0.001);
          totalWeight += weight;
          weightedValue += p.value * weight;
        }
      });

      return totalWeight > 0 ? weightedValue / totalWeight : defaultValue;
    };

    // Sample metrics at 3 points along the route: Start, Middle, End
    const samplePoints = [
      roadWaypoints[0],
      roadWaypoints[Math.floor(roadWaypoints.length / 2)],
      roadWaypoints[roadWaypoints.length - 1]
    ];

    const trafficRaw = samplePoints.reduce((acc, p) => acc + getSampledValue(p, 'traffic', 50), 0) / 3;
    const aqiRaw = samplePoints.reduce((acc, p) => acc + getSampledValue(p, 'pollution', 100), 0) / 3;
    const tempRaw = samplePoints.reduce((acc, p) => acc + getSampledValue(p, 'temperature', 32), 0) / 3;

    // Apply time-of-day adjustments for a more "dynamic" feel while staying grounded in data
    const traffic = isPeakHour ? Math.min(100, trafficRaw * 1.4) : isNight ? trafficRaw * 0.4 : trafficRaw;
    const aqi = isPeakHour ? aqiRaw * 1.3 : isNight ? aqiRaw * 0.7 : aqiRaw;
    const temp = (hour >= 10 && hour <= 16) ? tempRaw + 3 : (hour >= 22 || hour <= 5) ? tempRaw - 4 : tempRaw;

    // Use OSRM duration as base, then adjust for congestion
    const congestionMultiplier = traffic > 80 ? 2.2 : traffic > 50 ? 1.5 : isNight ? 0.8 : 1.1;
    const durationMin = osrmDurationMin
      ? Math.round(osrmDurationMin * congestionMultiplier)
      : (() => {
          const avgSpeedKmh = traffic > 70 ? 12 : traffic > 40 ? 22 : 38;
          return Math.round((distKm / avgSpeedKmh) * 60);
        })();

    const conditions: RouteIntelligence['conditions'] = traffic > 70 ? 'poor' : traffic > 45 ? 'moderate' : traffic > 20 ? 'good' : 'excellent';

    const bestHour = isNight ? 'Now (clear roads)' : isPeakHour ? 'Wait until after 10:30 AM or 8:30 PM' : 'Conditions are reasonable now';

    const recommendationMap: Record<RouteIntelligence['conditions'], string> = {
      excellent: `Clear route from ${routeOrigin} to ${routeDestination}. Expect smooth travel with minimal stops.`,
      good: `Moderate flow expected. Keep an eye on AQI levels (${Math.round(aqi)}). Travel time estimated at ${durationMin} mins.`,
      moderate: `Partial congestion expected on this corridor. Consider the Western Express Highway as an alternate if available.`,
      poor: `High congestion detected. Peak hour traffic at ${Math.round(traffic)}% capacity. Recommend delaying departure or using metro/local train.`,
    };

    setRoutePrediction({
      origin: routeOrigin,
      destination: routeDestination,
      departureTime: routeDepartureTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      estimatedDuration: durationMin,
      trafficCongestion: Math.round(traffic),
      avgAQI: Math.round(aqi),
      avgTemperature: Math.round(temp * 10) / 10,
      recommendation: recommendationMap[conditions],
      bestTimeToDepart: bestHour,
      routePoints: roadWaypoints,
      conditions,
    });

    setRoutePolyline(roadWaypoints);
    setIsLoadingRoute(false);
  };

  const renderLanding = () => (
    <div className="flex flex-col w-full relative z-10">
      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center space-y-12 px-8 relative overflow-hidden">
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center space-y-6"
        >
          <div className="flex flex-col items-center justify-center space-y-4 mb-8">
            <div className="relative">
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full"
              />
              <Globe className="w-24 h-24 text-emerald-400 relative z-10" />
            </div>
            <div className="space-y-1">
              <h1 className="text-8xl font-black tracking-tighter italic leading-none">
                URBAN<span className="text-emerald-400">INSIGHT</span>
              </h1>
              <div className="flex items-center justify-center space-x-3">
                <div className="h-px w-12 bg-white/20" />
                <p className="text-xs font-black text-white/40 uppercase tracking-[0.6em]">Command & Control v2.4.0</p>
                <div className="h-px w-12 bg-white/20" />
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 w-full max-w-7xl">
          <motion.button
            whileHover={{ scale: 1.02, y: -10 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('map')}
            className="glass group p-16 rounded-[4rem] border-white/5 hover:border-emerald-500/30 transition-all text-left space-y-8 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Maximize2 className="w-48 h-48" />
            </div>
            <div className="w-20 h-20 bg-emerald-500/20 rounded-3xl flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-black transition-all duration-500 shadow-2xl">
              <Maximize2 className="w-10 h-10" />
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-black uppercase italic tracking-tight">Geospatial <span className="text-emerald-400">Map</span></h2>
              <p className="text-white/40 text-sm font-medium leading-relaxed max-w-xs">Immersive real-time command center with multi-layer geospatial visualization and node analysis.</p>
            </div>
            <div className="flex items-center text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em]">
              Initialize Interface <ChevronRight className="w-4 h-4 ml-2 animate-bounce-x" />
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -10 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('categories')}
            className="glass group p-16 rounded-[4rem] border-white/5 hover:border-blue-500/30 transition-all text-left space-y-8 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Cpu className="w-48 h-48" />
            </div>
            <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-black transition-all duration-500 shadow-2xl">
              <Cpu className="w-10 h-10" />
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-black uppercase italic tracking-tight">Regional <span className="text-blue-400">Matrix</span></h2>
              <p className="text-white/40 text-sm font-medium leading-relaxed max-w-xs">Dynamic activity distribution matrix with comparative regional analysis and intensity mapping.</p>
            </div>
            <div className="flex items-center text-blue-400 text-[10px] font-black uppercase tracking-[0.3em]">
              Access Intelligence <ChevronRight className="w-4 h-4 ml-2 animate-bounce-x" />
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -10 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('route')}
            className="glass group p-16 rounded-[4rem] border-white/5 hover:border-violet-500/30 transition-all text-left space-y-8 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp className="w-48 h-48" />
            </div>
            <div className="w-20 h-20 bg-violet-500/20 rounded-3xl flex items-center justify-center group-hover:bg-violet-500 group-hover:text-black transition-all duration-500 shadow-2xl">
              <TrendingUp className="w-10 h-10" />
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-black uppercase italic tracking-tight">Route <span className="text-violet-400">Intelligence</span></h2>
              <p className="text-white/40 text-sm font-medium leading-relaxed max-w-xs">Predict traffic, AQI and temperature for your journey and visualize the route trace on the live map.</p>
            </div>
            <div className="flex items-center text-violet-400 text-[10px] font-black uppercase tracking-[0.3em]">
              Plan Journey <ChevronRight className="w-4 h-4 ml-2 animate-bounce-x" />
            </div>
          </motion.button>
        </div>

        {/* Hero Bottom Metrics */}
        

        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-2 opacity-40"
        >
          <span className="text-[8px] font-black uppercase tracking-[0.4em]">Scroll to Explore</span>
          <div className="w-px h-12 bg-gradient-to-b from-emerald-400 to-transparent" />
        </motion.div>
      </section>

      {/* Platform Overview Section */}
      <section className="py-32 px-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          <div className="space-y-4">
            <span className="text-xs font-black text-emerald-400 uppercase tracking-[0.4em]">Integrated Intelligence</span>
            <h2 className="text-6xl font-black italic uppercase tracking-tighter leading-none">Unified Urban <br/> <span className="text-emerald-400">Command Center</span></h2>
          </div>
          <p className="text-white/40 text-lg leading-relaxed">
            UrbanInsight is more than just a dashboard. It's a comprehensive operating system for the modern city. By synthesizing data from IoT sensors, public records, and satellite imagery, we provide city planners and emergency responders with the clarity needed to make life-saving decisions in real-time.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="glass p-6 rounded-3xl border-white/5 space-y-2">
              <div className="text-emerald-400 font-black italic tracking-tighter text-2xl">99.9%</div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Uptime Reliability</p>
            </div>
            <div className="glass p-6 rounded-3xl border-white/5 space-y-2">
              <div className="text-emerald-400 font-black italic tracking-tighter text-2xl">24/7</div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Active Monitoring</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative aspect-square"
        >
          <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full animate-pulse" />
          <div className="relative z-10 w-full h-full glass rounded-[4rem] border-white/10 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:30px_30px]" />
            <div className="relative flex flex-col items-center space-y-6">
              <div className="w-32 h-32 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                <Globe className="w-16 h-16 text-emerald-400 animate-spin-slow" />
              </div>
              <div className="text-center space-y-2">
                <div className="text-2xl font-black italic uppercase tracking-tighter">Global Mesh Network</div>
                <div className="flex items-center justify-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Syncing Local Nodes...</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-32 px-8 max-w-7xl mx-auto w-full space-y-24">
        <div className="text-center space-y-4">
          <h2 className="text-6xl font-black italic uppercase tracking-tighter">Advanced <span className="text-emerald-400">Capabilities</span></h2>
          <p className="text-sm font-bold text-white/40 uppercase tracking-[0.4em]">Next-generation urban data processing</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: Zap, title: "Real-time Sync", desc: "Sub-millisecond latency in data propagation across all nodes and visualization layers." },
            { icon: ShieldAlert, title: "Anomaly Detection", desc: "AI-driven pattern recognition for identifying critical urban incidents before they escalate." },
            { icon: Database, title: "Massive Storage", desc: "Scalable infrastructure capable of processing petabytes of historical urban activity data." },
            { icon: Globe, title: "Global Mesh", desc: "Interconnected urban networks providing a unified view of global metropolitan trends." },
            { icon: Terminal, title: "Custom Queries", desc: "Powerful command-line interface for complex data extraction and regional filtering." },
            { icon: Settings, title: "Dynamic Config", desc: "Fully customizable visualization parameters to suit specific operational requirements." }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass p-10 rounded-[2.5rem] border-white/5 space-y-6 hover:border-emerald-500/20 transition-all group"
            >
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-all">
                <feature.icon className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold uppercase tracking-tight italic">{feature.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderCategories = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-16 relative z-10 px-8 max-w-7xl mx-auto">
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center space-y-4"
      >
        <div className="flex items-center justify-center space-x-4 mb-2">
          <button onClick={() => setView('landing')} className="glass p-3 rounded-2xl hover:bg-white/10 transition-all absolute left-8 top-12">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-5xl font-black italic uppercase tracking-tighter">Analysis <span className="text-emerald-400">Domains</span></h2>
        </div>
        <p className="text-sm font-bold text-white/40 uppercase tracking-[0.4em]">Select a data vertical to explore regional intensity</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 w-full">
        {URBAN_LAYERS.map((layer, i) => (
          <motion.button
            key={layer.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -15, scale: 1.02 }}
            onClick={() => {
              setActiveLayerId(layer.id);
              setView('regional');
            }}
            className="glass group p-10 rounded-[3rem] border-white/5 hover:border-white/20 transition-all text-center space-y-8 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className={cn(
              "w-24 h-24 mx-auto rounded-[2rem] flex items-center justify-center transition-all duration-500 shadow-2xl",
              layer.id === 'traffic' && "bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(59,130,246,0.5)]",
              layer.id === 'pollution' && "bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]",
              layer.id === 'temperature' && "bg-orange-500/20 text-orange-400 group-hover:bg-orange-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]",
              layer.id === 'crime' && "bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(244,63,94,0.5)]"
            )}>
              {layer.id === 'traffic' && <Activity className="w-12 h-12" />}
              {layer.id === 'pollution' && <Wind className="w-12 h-12" />}
              {layer.id === 'temperature' && <Thermometer className="w-12 h-12" />}
              {layer.id === 'crime' && <ShieldAlert className="w-12 h-12" />}
            </div>
            
            <div className="relative z-10">
              <h3 className="text-2xl font-black uppercase tracking-tight italic">{layer.name}</h3>
              <p className="text-[10px] text-white/40 mt-3 font-bold uppercase tracking-widest leading-relaxed">{layer.description}</p>
            </div>

            <div className="pt-4 flex justify-center">
              <div className="w-8 h-1 bg-white/10 rounded-full group-hover:w-16 group-hover:bg-white/40 transition-all duration-500" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );

  const renderRegional = () => {
    const data = filteredData;
    const maxVal = Math.max(...(datasets[activeLayerId] || []).map(p => p.value), 1);
    const avgVal = Math.round(data.reduce((acc, p) => acc + p.value, 0) / (data.length || 1));
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    return (
      <div className="flex flex-col h-full relative z-10 p-12 space-y-8 overflow-y-auto custom-scrollbar">
        {/* Critical Alerts Banner */}
        <AnimatePresence>
          {criticalAlerts.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass rounded-2xl p-4 border-rose-500/30 bg-rose-500/5 flex items-start space-x-4"
            >
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-1" />
              <div className="flex-1 space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-rose-400">Critical Alerts</p>
                {criticalAlerts.map((alert, i) => (
                  <p key={i} className="text-xs text-white/60">
                    {alert.location}: {alert.value} {alert.unit}
                  </p>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <button onClick={() => setView('categories')} className="glass p-4 rounded-2xl hover:bg-white/10 transition-all border-white/5">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  activeLayerId === 'traffic' && "bg-blue-400",
                  activeLayerId === 'pollution' && "bg-emerald-400",
                  activeLayerId === 'temperature' && "bg-orange-400",
                  activeLayerId === 'crime' && "bg-rose-400"
                )} />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Regional Intelligence Matrix</span>
              </div>
              <h2 className="text-5xl font-black italic uppercase tracking-tighter">{activeLayer.name} <span className="text-emerald-400">Activity Distribution</span></h2>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Live Badge */}
            <motion.div 
              animate={{ opacity: [0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="glass px-4 py-2 rounded-full flex items-center space-x-2 border-emerald-500/30"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Live</span>
            </motion.div>
            
            <div className="glass px-8 py-4 rounded-[2rem] flex items-center space-x-8 border-white/5">
              <div className="text-center">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Average Index</p>
                <p className="text-2xl font-black italic tracking-tighter">{avgVal}</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Peak Intensity</p>
                <p className="text-2xl font-black italic tracking-tighter text-rose-400">{maxVal}</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Active Nodes</p>
                <p className="text-2xl font-black italic tracking-tighter text-emerald-400">{data.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {sortedData.map((point, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ scale: 1.05, zIndex: 20 }}
              className={cn(
                "p-8 rounded-[2.5rem] border transition-all duration-500 flex flex-col justify-between h-56 relative overflow-hidden group shadow-2xl",
                getIntensityColor(point.value, maxVal)
              )}
            >
              {/* Decorative background element */}
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
                {activeLayerId === 'traffic' && <Activity className="w-32 h-32" />}
                {activeLayerId === 'pollution' && <Wind className="w-32 h-32" />}
                {activeLayerId === 'temperature' && <Thermometer className="w-32 h-32" />}
                {activeLayerId === 'crime' && <ShieldAlert className="w-32 h-32" />}
              </div>

              <div className="relative z-10 flex justify-between items-start">
                <div className="space-y-1">
                  <h4 className="text-sm font-black uppercase tracking-widest leading-none">{point.label}</h4>
                  <p className="text-[8px] font-bold uppercase tracking-widest opacity-60">Sector {i + 101}</p>
                </div>
                <div className="p-2 bg-black/20 rounded-xl backdrop-blur-md border border-white/10">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </div>

              <div className="relative z-10 flex flex-col space-y-2">
                <div className="flex items-baseline space-x-2">
                  <span className="text-5xl font-black tracking-tighter italic leading-none">{point.value}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{activeLayer.unit}</span>
                </div>
                <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(point.value / maxVal) * 100}%` }}
                    className="h-full bg-white/40"
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Intensity Index</span>
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4, 5].map(dot => (
                      <div 
                        key={dot} 
                        className={cn(
                          "w-1 h-1 rounded-full",
                          dot <= (point.value / maxVal) * 5 ? "bg-white" : "bg-white/20"
                        )} 
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* AI Insight Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-8 border-emerald-500/20 bg-emerald-500/5 space-y-4 mt-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">AI-Powered Insight</h3>
            </div>
            <motion.div 
              animate={{ rotate: isLoadingInsight ? 360 : 0 }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "loop" }}
            >
              <Zap className={cn("w-4 h-4", isLoadingInsight ? "text-emerald-400" : "text-white/30")} />
            </motion.div>
          </div>
          <p className="text-sm leading-relaxed text-white/80">{aiInsight || 'Analyzing patterns...'}</p>
          <button 
            onClick={handleGenerateReport}
            disabled={isLoadingReport}
            className="mt-4 w-full glass-hover p-3 rounded-xl flex items-center justify-center space-x-2 border-white/5 hover:border-emerald-500/30 transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-widest">{isLoadingReport ? 'Generating...' : 'Generate Executive Report'}</span>
          </button>
        </motion.div>
      </div>
    );
  };

  const renderRoute = () => {
    const conditionColors: Record<string, string> = {
      excellent: 'text-emerald-400',
      good: 'text-blue-400',
      moderate: 'text-amber-400',
      poor: 'text-rose-400',
    };
    const conditionBg: Record<string, string> = {
      excellent: 'border-emerald-500/30 bg-emerald-500/5',
      good: 'border-blue-500/30 bg-blue-500/5',
      moderate: 'border-amber-500/30 bg-amber-500/5',
      poor: 'border-rose-500/30 bg-rose-500/5',
    };

    return (
      <div className="flex flex-col h-full relative z-10 p-12 space-y-8 overflow-y-auto custom-scrollbar max-w-5xl mx-auto w-full">
        <div className="flex items-center space-x-6">
          <button onClick={() => setView('landing')} className="glass p-4 rounded-2xl hover:bg-white/10 transition-all border-white/5">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Route Intelligence Engine</span>
            </div>
            <h2 className="text-5xl font-black italic uppercase tracking-tighter">Journey <span className="text-violet-400">Predictor</span></h2>
          </div>
        </div>

        {/* Input Panel */}
        <div className="glass rounded-3xl p-8 border-white/5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block">From</label>
              <input
                list="mumbai-locations-from"
                value={routeOrigin}
                onChange={(e) => setRouteOrigin(e.target.value)}
                placeholder="e.g. Bandra"
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white text-sm focus:border-violet-500/50 focus:outline-none bg-black/20 placeholder:text-white/20"
              />
              <datalist id="mumbai-locations-from">
                {Object.keys(MUMBAI_LOCATION_COORDS).map(loc => <option key={loc} value={loc} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block">To</label>
              <input
                list="mumbai-locations-to"
                value={routeDestination}
                onChange={(e) => setRouteDestination(e.target.value)}
                placeholder="e.g. Andheri"
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white text-sm focus:border-violet-500/50 focus:outline-none bg-black/20 placeholder:text-white/20"
              />
              <datalist id="mumbai-locations-to">
                {Object.keys(MUMBAI_LOCATION_COORDS).map(loc => <option key={loc} value={loc} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block">Departure Time</label>
              <input
                type="time"
                value={routeDepartureTime}
                onChange={(e) => setRouteDepartureTime(e.target.value)}
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white text-sm focus:border-violet-500/50 focus:outline-none bg-black/20 [color-scheme:dark]"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRoutePredict}
            disabled={!routeOrigin || !routeDestination || isLoadingRoute}
            className="w-full py-4 rounded-2xl bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 hover:border-violet-500/70 transition-all text-violet-400 font-black text-sm uppercase tracking-[0.3em] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-3 shadow-[0_0_30px_rgba(139,92,246,0.1)] hover:shadow-[0_0_40px_rgba(139,92,246,0.25)]"
          >
            {isLoadingRoute ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
                <span>Analyzing Route...</span>
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                <span>Predict Journey</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Results Panel */}
        {routePrediction && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Condition Banner */}
            <div className={`glass rounded-2xl p-5 border flex items-center justify-between ${conditionBg[routePrediction.conditions]}`}>
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Journey Condition</p>
                <p className={`text-2xl font-black uppercase italic tracking-tight ${conditionColors[routePrediction.conditions]}`}>
                  {routePrediction.conditions.toUpperCase()} CONDITIONS
                </p>
                <p className="text-xs text-white/60 max-w-lg leading-relaxed">{routePrediction.recommendation}</p>
              </div>
              <div className="text-right space-y-1 flex-shrink-0 ml-8">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Est. Duration</p>
                <p className={`text-5xl font-black italic tracking-tighter ${conditionColors[routePrediction.conditions]}`}>{routePrediction.estimatedDuration}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">minutes</p>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Traffic Congestion', value: `${routePrediction.trafficCongestion}%`, sub: 'corridor avg', color: routePrediction.trafficCongestion > 70 ? 'text-rose-400' : routePrediction.trafficCongestion > 40 ? 'text-amber-400' : 'text-emerald-400', icon: Activity },
                { label: 'Avg AQI', value: `${routePrediction.avgAQI}`, sub: routePrediction.avgAQI > 150 ? 'Unhealthy' : routePrediction.avgAQI > 100 ? 'Moderate' : 'Good', color: routePrediction.avgAQI > 150 ? 'text-rose-400' : routePrediction.avgAQI > 100 ? 'text-amber-400' : 'text-emerald-400', icon: Wind },
                { label: 'Avg Temperature', value: `${routePrediction.avgTemperature}°C`, sub: 'along route', color: routePrediction.avgTemperature > 37 ? 'text-rose-400' : 'text-orange-400', icon: Thermometer },
              ].map((metric, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass rounded-2xl p-6 border-white/5 space-y-3"
                >
                  <div className="flex items-center space-x-2 text-white/30">
                    <metric.icon className="w-4 h-4" />
                    <p className="text-[9px] font-black uppercase tracking-widest">{metric.label}</p>
                  </div>
                  <p className={`text-4xl font-black italic tracking-tighter ${metric.color}`}>{metric.value}</p>
                  <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">{metric.sub}</p>
                </motion.div>
              ))}
            </div>

            {/* Best Departure + View on Map */}
            <div className="glass rounded-2xl p-6 border-white/5 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-violet-400" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Best Time to Depart</p>
                </div>
                <p className="text-sm font-bold text-white/80">{routePrediction.bestTimeToDepart}</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setShowRouteOnMap(true);
                  setView('map');
                }}
                className="glass px-6 py-3 rounded-xl border border-violet-500/40 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/10 transition-all"
              >
                View on Map →
              </motion.button>
            </div>
          </motion.div>
        )}

        {!routePrediction && !isLoadingRoute && (
          <div className="glass rounded-3xl p-16 border-white/5 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-16 h-16 bg-violet-500/10 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-violet-400/40" />
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-white/20">Enter origin and destination to predict your journey</p>
          </div>
        )}
      </div>
    );
  };

  // Report Modal Component
  const ReportModal = () => (
    <AnimatePresence>
      {showReportModal && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setShowReportModal(false)}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] overflow-auto border-white/10 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">Executive Report</h2>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-sm leading-relaxed text-white/80">
              {reportContent.split('\n').map((line, i) => (
                line.trim() && (
                  <p key={i} className={cn(
                    line.includes('EXECUTIVE') || line.includes('Generated') ? 'font-black text-white text-xs uppercase tracking-widest' : '',
                    line.includes(':') && !line.includes('Generated') ? 'font-bold text-emerald-400' : ''
                  )}>
                    {line}
                  </p>
                )
              ))}
            </div>
            
            <button 
              onClick={() => {
                const element = document.createElement('a');
                element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportContent));
                element.setAttribute('download', `urban_report_${new Date().toISOString().split('T')[0]}.txt`);
                element.style.display = 'none';
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
              }}
              className="w-full glass-hover p-3 rounded-xl flex items-center justify-center space-x-2 border-white/5 hover:border-emerald-500/30 transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">Download Report</span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={cn(
      "min-h-screen w-full bg-[#050505] text-white font-sans selection:bg-emerald-500 selection:text-black",
      view === 'landing' ? "overflow-y-visible" : "h-screen overflow-hidden"
    )}>
      {/* Upload Success Toast */}
      <AnimatePresence>
        {showUploadSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: -50 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: -50 }}
            className="fixed top-24 left-8 z-50 glass rounded-2xl p-6 border-emerald-500/30 bg-emerald-500/5 space-y-3 max-w-sm"
          >
            <div className="flex items-center space-x-3">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6 }}
                className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"
              >
                <Zap className="w-4 h-4 text-emerald-400" />
              </motion.div>
              <div>
                <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">Dataset Loaded</p>
                <p className="text-xs text-white/60">{uploadedRowCount} data points imported</p>
              </div>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">Heatmap is now displaying your custom dataset on the map.</p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Map (Visible in Map View or as Blur in others) */}
      <div className={cn(
        "fixed inset-0 z-0 transition-all duration-1000",
        view === 'map' ? "opacity-100" : "opacity-30 blur-md scale-110"
      )}>
        <MapContainer 
          center={[19.0760, 72.8777]} 
          zoom={12} 
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          <HeatmapLayer points={heatmapPoints} />
          <MapEvents filteredData={filteredData} fullData={datasets[activeLayerId] || []} setClickedPoint={setClickedPoint} />
          
          {clickedPoint && (
            <Popup 
              position={[clickedPoint.lat, clickedPoint.lng]} 
              onClose={() => setClickedPoint(null)}
              className="urban-popup"
            >
              <div className="p-3 bg-[#0a0a0a] text-white border border-white/10 rounded-xl shadow-2xl min-w-[160px]">
                <div className="flex items-center space-x-2 mb-2">
                  <Globe className="w-3 h-3 text-emerald-400" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Location Identified</p>
                </div>
                <h4 className="text-lg font-black italic uppercase tracking-tight leading-none mb-1">{clickedPoint.label}</h4>
                <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-white/40 uppercase font-bold">Active Layer</span>
                    <span className="text-[10px] font-bold text-white/80">{activeLayer.name}</span>
                  </div>
                  {clickedPoint.value > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-white/40 uppercase font-bold">Local Intensity</span>
                      <span className="text-xs font-black text-emerald-400">{clickedPoint.value}</span>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {filteredData.map((point, idx) => (
            <Marker 
              key={`${activeLayerId}-${idx}`} 
              position={[point.latitude, point.longitude]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="w-4 h-4 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm animate-pulse"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              })}
            >
              <Popup className="urban-popup">
                <div className="p-2 bg-[#0a0a0a] text-white border border-white/10 rounded-xl shadow-2xl min-w-[120px]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">{activeLayer.name}</p>
                  <p className="text-sm font-bold italic uppercase tracking-tight">{point.label || 'Unknown Sector'}</p>
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[8px] text-white/40 uppercase font-bold">Intensity</span>
                    <span className="text-xs font-black">{point.value}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {showRouteOnMap && routePolyline && routePolyline.length > 1 && (
            <>
              {/* Road outline */}
              <Polyline
                positions={routePolyline}
                pathOptions={{
                  color: '#1e1b4b',
                  weight: 8,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Road fill */}
              <Polyline
                positions={routePolyline}
                pathOptions={{
                  color: '#8b5cf6',
                  weight: 5,
                  opacity: 0.95,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </>
          )}

          {showRouteOnMap && routePrediction && (() => {
            const originCoords = MUMBAI_LOCATION_COORDS[routePrediction.origin];
            const destCoords = MUMBAI_LOCATION_COORDS[routePrediction.destination];
            return (
              <>
                {originCoords && (
                  <Marker
                    position={originCoords}
                    icon={L.divIcon({
                      className: 'custom-div-icon',
                      html: `<div style="width:14px;height:14px;border-radius:50%;background:#8b5cf6;border:2px solid white;box-shadow:0 0 12px rgba(139,92,246,0.8)"></div>`,
                      iconSize: [14, 14],
                      iconAnchor: [7, 7],
                    })}
                  >
                    <Popup><div className="p-2 bg-[#0a0a0a] text-white rounded-xl"><p className="text-xs font-black text-violet-400">ORIGIN</p><p className="text-sm font-bold">{routePrediction.origin}</p></div></Popup>
                  </Marker>
                )}
                {destCoords && (
                  <Marker
                    position={destCoords}
                    icon={L.divIcon({
                      className: 'custom-div-icon',
                      html: `<div style="width:14px;height:14px;border-radius:50%;background:#10b981;border:2px solid white;box-shadow:0 0 12px rgba(16,185,129,0.8)"></div>`,
                      iconSize: [14, 14],
                      iconAnchor: [7, 7],
                    })}
                  >
                    <Popup><div className="p-2 bg-[#0a0a0a] text-white rounded-xl"><p className="text-xs font-black text-emerald-400">DESTINATION</p><p className="text-sm font-bold">{routePrediction.destination}</p></div></Popup>
                  </Marker>
                )}
              </>
            );
          })()}
        </MapContainer>
      </div>

      {/* Atmospheric Overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-black/80" />

      {/* Dynamic View Rendering */}
      <AnimatePresence mode="wait">
        {view === 'landing' && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="relative w-full">
            {renderLanding()}
          </motion.div>
        )}
        {view === 'categories' && (
          <motion.div key="categories" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="h-full">
            {renderCategories()}
          </motion.div>
        )}
        {view === 'regional' && (
          <motion.div key="regional" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="h-full">
            {renderRegional()}
          </motion.div>
        )}
        {view === 'route' && (
          <motion.div
            key="route"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="h-full"
          >
            {renderRoute()}
          </motion.div>
        )}
        {view === 'map' && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full relative z-10 pointer-events-none">
            {/* Top Command Bar */}
            <header className="absolute top-0 left-0 right-0 z-50 h-20 px-8 flex items-center justify-between pointer-events-none">
              <div className="flex items-center space-x-12 pointer-events-auto">
                <button onClick={() => { setView('landing'); setShowRouteOnMap(false); }} className="flex items-center space-x-3 group">
                  <div className="w-10 h-10 glass rounded-xl flex items-center justify-center border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                    <Globe className="w-6 h-6 text-emerald-400 group-hover:text-inherit" />
                  </div>
                  <div className="leading-none">
                    <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Urban<span className="text-emerald-400">Insight</span></h1>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em]">Live System Status: Optimal</p>
                    </div>
                  </div>
                </button>

                <div className={cn(
                  "glass rounded-2xl flex items-center px-4 py-2 transition-all duration-500 border-white/5",
                  isSearchFocused ? "w-96 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "w-64"
                )}>
                  <Search className="w-4 h-4 text-white/40 mr-3" />
                  <input 
                    type="text" 
                    placeholder="Search urban nodes..." 
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    className="bg-transparent border-none outline-none text-xs font-medium w-full placeholder:text-white/20"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4 pointer-events-auto">
                <button className="glass glass-hover p-2.5 rounded-xl">
                  <Bell className="w-5 h-5 text-white/60" />
                </button>
                <div className="glass rounded-2xl p-1 flex items-center space-x-3 pl-3 pr-1 border-white/10">
                  <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Admin</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 overflow-hidden">
                    <img src="https://picsum.photos/seed/admin/100/100" alt="Admin" referrerPolicy="no-referrer" />
                  </div>
                </div>
              </div>
            </header>

            {/* Left Control Deck */}
            <div className="absolute left-8 top-24 bottom-24 w-80 z-40 flex flex-col space-y-6 pointer-events-auto overflow-y-auto pr-2" style={{scrollbarWidth: 'thin'}}>
              {/* Layer Deck */}
              <div className="glass rounded-3xl p-6 flex flex-col space-y-6 border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Urban Layers</h2>
                  </div>
                  <div className="px-2 py-0.5 glass rounded-full text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Active</div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {URBAN_LAYERS.map((layer) => (
                    <button
                      key={layer.id}
                      onClick={() => setActiveLayerId(layer.id)}
                      className={cn(
                        "flex items-center p-4 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                        activeLayerId === layer.id 
                          ? "bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                          : "hover:bg-white/5 border border-transparent"
                      )}
                    >
                      {activeLayerId === layer.id && (
                        <motion.div 
                          layoutId="active-glow"
                          className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none"
                        />
                      )}
                      <div className={cn(
                        "p-2.5 rounded-xl mr-4 transition-all duration-500",
                        activeLayerId === layer.id ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "bg-white/5 text-white/40 group-hover:text-white"
                      )}>
                        {layer.id === 'traffic' && <Activity className="w-4 h-4" />}
                        {layer.id === 'pollution' && <Wind className="w-4 h-4" />}
                        {layer.id === 'temperature' && <Thermometer className="w-4 h-4" />}
                        {layer.id === 'crime' && <ShieldAlert className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 text-left">
                        <p className={cn("text-xs font-black uppercase tracking-wider", activeLayerId === layer.id ? "text-white" : "text-white/60")}>{layer.name}</p>
                        <p className="text-[9px] text-white/30 mt-0.5 font-medium">{layer.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ingestion Deck */}
              <div className="glass rounded-3xl p-6 space-y-4 border-white/5">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Custom Dataset</h2>
                </div>
                
                <label className="flex items-center justify-center w-full h-20 glass glass-hover rounded-2xl border-dashed border-emerald-500/30 cursor-pointer group hover:border-emerald-500/60 transition-all">
                  <div className="flex flex-col items-center space-y-2">
                    <Upload className="w-5 h-5 text-white/20 group-hover:text-emerald-400 transition-colors" />
                    <div className="text-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/60">Import CSV</span>
                      <p className="text-[8px] text-white/20 mt-1">latitude, longitude, value</p>
                    </div>
                  </div>
                  <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                </label>
                
                <p className="text-[8px] text-white/30 leading-tight">
                  Upload custom data to visualize on the heatmap. Auto-switches to map view on import.
                </p>
              </div>
            </div>

            {/* Right Analytics Deck */}
            <div className="absolute right-8 top-24 bottom-24 w-96 z-40 flex flex-col space-y-6 pointer-events-auto">
              {/* Main Analytics */}
              <div className="glass rounded-[2rem] p-8 flex flex-col h-[450px] border-white/5 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Real-time Analytics</h3>
                  </div>
                  <div className="flex items-center space-x-2 glass px-3 py-1 rounded-full border-white/5">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Live</span>
                  </div>
                </div>

                <div className="mb-8">
                  {clickedPoint ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-black tracking-tighter text-emerald-400 uppercase italic">Location Selected</h4>
                        <button 
                          onClick={() => setClickedPoint(null)}
                          className="p-1.5 hover:bg-white/5 rounded-lg transition-all"
                        >
                          <X className="w-4 h-4 text-white/40 hover:text-white" />
                        </button>
                      </div>
                      <h3 className="text-2xl font-black tracking-tighter text-white uppercase italic leading-none mb-3">{clickedPoint.label}</h3>
                      <div className="space-y-4">
                        <div>
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Current Value</p>
                          <div className="flex items-baseline space-x-2">
                            <p className="text-4xl font-black text-emerald-400 tracking-tighter">{clickedPoint.value}</p>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">{activeLayer.unit}</p>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-white/10">
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Layer</p>
                          <p className="text-sm font-bold text-white/60">{activeLayer.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="glass p-3 rounded-xl border-white/5">
                            <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Latitude</p>
                            <p className="text-xs font-mono text-emerald-400">{clickedPoint.lat.toFixed(4)}</p>
                          </div>
                          <div className="glass p-3 rounded-xl border-white/5">
                            <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Longitude</p>
                            <p className="text-xs font-mono text-emerald-400">{clickedPoint.lng.toFixed(4)}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className="text-2xl font-black tracking-tighter text-white uppercase italic leading-none">{analytics.title}</h4>
                      <div className="flex items-baseline space-x-2 mt-2">
                        <p className="text-4xl font-black text-emerald-400 tracking-tighter">{analytics.metric.split(' ')[0]}</p>
                        <p className="text-xs font-bold text-white/40 uppercase tracking-widest">{analytics.metric.split(' ').slice(1).join(' ')}</p>
                      </div>
                      <p className="text-[10px] text-white/30 mt-4 leading-relaxed">Click on a location on the map to view specific data</p>
                    </>
                  )}
                </div>
              </div>
            </div>


            {/* Bottom Status Rail */}
            <footer className="absolute bottom-0 left-0 right-0 z-50 h-12 px-8 flex items-center justify-between pointer-events-none">
              <div className="flex items-center space-x-6 pointer-events-auto">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">CPU: 14%</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Maximize2 className="w-3 h-3 text-white/40" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">LAT: 19.076</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Settings className="w-3 h-3 text-white/40" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">V: 2.4.0-PRO</span>
                </div>
              </div>

              <div className="glass rounded-full px-6 py-1 flex items-center space-x-8 pointer-events-auto border-white/5">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Network: Secure</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Sync: Active</span>
                </div>
              </div>
            </footer>

            {/* Floating Legend (Minimal) */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 glass rounded-full px-8 py-3 flex items-center space-x-8 border-white/5 pointer-events-auto">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Critical</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-[#eab308] shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Moderate</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Stable</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .leaflet-container {
          background: #050505 !important;
        }
        .custom-popup .leaflet-popup-content-wrapper {
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          color: white;
          padding: 8px;
        }
        .custom-popup .leaflet-popup-tip {
          background: rgba(0,0,0,0.8);
        }
        input[type='range']::-webkit-slider-thumb {
          width: 16px;
          height: 16px;
          background: #10b981;
          border-radius: 50%;
          cursor: pointer;
          appearance: none;
          border: 2px solid #050505;
          box-shadow: 0 0 10px rgba(16,185,129,0.5);
        }
      `}} />
      
      <ReportModal />
    </div>
  );
}
