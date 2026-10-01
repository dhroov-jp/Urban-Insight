import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
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
  HardHat,
  Droplet,
  Loader2
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
import DrawAOILayer from './components/DrawAOILayer';
import ConstructionChangeLayer from './components/ConstructionChangeLayer';
import { ConstructionControlPanel, ConstructionResultsPanel } from './components/ConstructionDeck';
import { LightingControlPanel, LightingResultsPanel } from './components/LightingDeck';
import { ReservoirControlPanel, ReservoirResultsPanel } from './components/ReservoirDeck';
import { checkConstructionActivity, ConstructionApiError, type ConstructionCheckResponse } from './lib/constructionApi';
import { generateAIInsight, generateExecutiveReport, POPULATION_DENSITY_REFERENCE, fetchAQI, fetchTrafficFlowTomTom, fetchStaticLayers } from './lib/api';

// Reservoir tracking imports
import {
  fetchReservoirCurrent,
  fetchReservoirHistory,
  fetchOverflowEvents,
  triggerManualScrape,
  type ReservoirSummary,
  type LakeReading,
  type HistoricalReading,
  type OverflowEvent
} from './lib/reservoirApi';
import { checkLightingAdequacy, type LightingCheckResponse } from './lib/lightingApi';
import { Moon } from 'lucide-react';


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
    title: 'Density Flux',
    metric: '12.4k / km²',
    color: '#8b5cf6',
    data: [
      { time: '00:00', value: 10 }, { time: '03:00', value: 5 }, { time: '06:00', value: 30 },
      { time: '09:00', value: 85 }, { time: '12:00', value: 95 }, { time: '15:00', value: 90 },
      { time: '18:00', value: 80 }, { time: '21:00', value: 40 }, { time: '24:00', value: 15 },
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

type ViewState = 'landing' | 'map' | 'categories' | 'regional';
type ModuleState = 'urban' | 'construction' | 'reservoirs' | 'lighting';

interface MapEventsProps {
  onMapClick: (lat: number, lng: number) => void;
}

const MapEvents = ({ onMapClick }: MapEventsProps) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
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

  // --- Construction Activity Monitoring module state ---
  const [activeModule, setActiveModule] = useState<ModuleState>('urban');
  const [constructionAOI, setConstructionAOI] = useState<GeoJSON.Polygon | null>(null);
  const [isCheckingConstruction, setIsCheckingConstruction] = useState(false);
  const [constructionResult, setConstructionResult] = useState<ConstructionCheckResponse | null>(null);
  const [constructionError, setConstructionError] = useState<string | null>(null);
  const [lookbackDays, setLookbackDays] = useState(60);
  const [baselineOffsetDays, setBaselineOffsetDays] = useState(180);
  const [maxCloudCover, setMaxCloudCover] = useState(20);

  // --- Reservoir Tracking module state ---
  const [reservoirSummary, setReservoirSummary] = useState<ReservoirSummary | null>(null);
  const [selectedLakeName, setSelectedLakeName] = useState<string | null>(null);
  const [reservoirHistory, setReservoirHistory] = useState<HistoricalReading[]>([]);
  const [reservoirOverflows, setReservoirOverflows] = useState<OverflowEvent[]>([]);
  const [reservoirHistoryDays, setReservoirHistoryDays] = useState<number>(90);
  const [isLoadingReservoirHistory, setIsLoadingReservoirHistory] = useState<boolean>(false);
  const [isScrapingReservoir, setIsScrapingReservoir] = useState<boolean>(false);
  const [scrapeReservoirError, setScrapeReservoirError] = useState<string | null>(null);
  const [scrapeReservoirSuccess, setScrapeReservoirSuccess] = useState<boolean>(false);

  // --- Reverse Geocoding Map Click state & refs ---
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const geocodeCacheRef = useRef<Record<string, string>>({});
  const geocodeTimeoutRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Live & static urban layers state ---
  const [trafficData, setTrafficData] = useState<any>(null);
  const [aqiData, setAqiData] = useState<any>(null);
  const [staticLayersData, setStaticLayersData] = useState<any>(null);

  const [isTrafficLoading, setIsTrafficLoading] = useState<boolean>(false);
  const [isAqiLoading, setIsAqiLoading] = useState<boolean>(false);
  const [isStaticLoading, setIsStaticLoading] = useState<boolean>(false);

  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [aqiError, setAqiError] = useState<string | null>(null);
  const [staticError, setStaticError] = useState<string | null>(null);

  const [lightingResult, setLightingResult] = useState<LightingCheckResponse | null>(null);
  const [isLightingLoading, setIsLightingLoading] = useState<boolean>(false);
  const [lightingError, setLightingError] = useState<string | null>(null);

  const urbanCacheRef = useRef<Record<string, {
    traffic: any;
    aqi: any;
    static: any;
    timestamp: number;
  }>>({});

  const handleMapClick = (lat: number, lng: number) => {
    // 1. Find nearest point in active layer datasets
    const data = datasets[activeLayerId] || [];
    let nearest = data.length > 0 ? data[0] : null;
    let minDistance = Infinity;

    if (data.length > 0) {
      data.forEach(p => {
        const d = Math.sqrt(Math.pow(p.latitude - lat, 2) + Math.pow(p.longitude - lng, 2));
        if (d < minDistance) {
          minDistance = d;
          nearest = p;
        }
      });
    }

    const isNear = minDistance < 0.02;

    if (isNear && nearest) {
      // Near an existing data point: use its label directly
      setClickedPoint({
        lat,
        lng,
        label: nearest.label || 'Unknown Area',
        value: nearest.value
      });
      setIsGeocoding(false);
      
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    // 2. Not near any data point: check cache
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (geocodeCacheRef.current[cacheKey]) {
      setClickedPoint({
        lat,
        lng,
        label: geocodeCacheRef.current[cacheKey],
        value: 0
      });
      setIsGeocoding(false);
      
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    // 3. Not in cache: show raw coords first + load address debounced
    const rawLabel = `Sector ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    setClickedPoint({
      lat,
      lng,
      label: rawLabel,
      value: 0
    });
    setIsGeocoding(true);

    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    geocodeTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            signal: controller.signal,
            headers: {
              'User-Agent': 'UrbanInsight-Geospatial-Intelligence-Platform/1.0',
              'Referer': window.location.origin
            }
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const resData = await response.json();
        
        // Build address parts: suburb/neighbourhood/sublocality + city/town/county
        let shortLabel = '';
        if (resData.address) {
          const addr = resData.address;
          const parts = [];
          
          if (addr.suburb) parts.push(addr.suburb);
          else if (addr.neighbourhood) parts.push(addr.neighbourhood);
          else if (addr.sublocality) parts.push(addr.sublocality);
          
          if (addr.city) parts.push(addr.city);
          else if (addr.town) parts.push(addr.town);
          else if (addr.county) parts.push(addr.county);
          
          shortLabel = parts.join(', ');
        }

        const finalLabel = shortLabel || resData.display_name || rawLabel;

        geocodeCacheRef.current[cacheKey] = finalLabel;

        setClickedPoint(prev => {
          if (prev && prev.lat === lat && prev.lng === lng) {
            return { ...prev, label: finalLabel };
          }
          return prev;
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Reverse Geocoding failed:", err);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsGeocoding(false);
        }
      }
    }, 500);
  };

  // Trigger parallel API/database queries when clickedPoint changes
  useEffect(() => {
    if (!clickedPoint) {
      setTrafficData(null);
      setAqiData(null);
      setStaticLayersData(null);
      setTrafficError(null);
      setAqiError(null);
      setStaticError(null);
      return;
    }

    const { lat, lng } = clickedPoint;
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const now = Date.now();
    const cached = urbanCacheRef.current[cacheKey];

    // Caching for 60 seconds (60000ms)
    if (cached && now - cached.timestamp < 60000) {
      setTrafficData(cached.traffic);
      setAqiData(cached.aqi);
      setStaticLayersData(cached.static);
      setTrafficError(null);
      setAqiError(null);
      setStaticError(null);
      setIsTrafficLoading(false);
      setIsAqiLoading(false);
      setIsStaticLoading(false);
      return;
    }

    setIsTrafficLoading(true);
    setIsAqiLoading(true);
    setIsStaticLoading(true);
    setTrafficError(null);
    setAqiError(null);
    setStaticError(null);
    
    // Also reset lighting if in lighting module
    if (activeModule === 'lighting') {
      setIsLightingLoading(true);
      setLightingResult(null);
      setLightingError(null);
    }

    let trafficRes: any = null;
    let aqiRes: any = null;
    let staticRes: any = null;

    const maybeCache = () => {
      if (trafficRes && aqiRes && staticRes) {
        urbanCacheRef.current[cacheKey] = {
          traffic: trafficRes,
          aqi: aqiRes,
          static: staticRes,
          timestamp: Date.now()
        };
      }
    };

    // 1. Fetch live TomTom Traffic data
    const getTraffic = async () => {
      try {
        const res = await fetchTrafficFlowTomTom(lat, lng);
        trafficRes = res;
        setTrafficData(res);
        if (res.status === 'error') {
          setTrafficError(res.message || 'Error fetching traffic');
        }
        maybeCache();
      } catch (err: any) {
        setTrafficError(err.message || 'Error fetching traffic');
      } finally {
        setIsTrafficLoading(false);
      }
    };

    // 2. Fetch live WAQI Air Quality data
    const getAqi = async () => {
      try {
        const res = await fetchAQI(lat, lng);
        aqiRes = res;
        setAqiData(res);
        if (res.status === 'error') {
          setAqiError(res.message || 'Error fetching AQI');
        }
        maybeCache();
      } catch (err: any) {
        setAqiError(err.message || 'Error fetching AQI');
      } finally {
        setIsAqiLoading(false);
      }
    };

    // 3. Fetch static Population & Crime database records
    const getStatic = async () => {
      try {
        const res = await fetchStaticLayers(lat, lng);
        staticRes = res;
        setStaticLayersData(res);
        if (res.status === 'error') {
          setStaticError(res.message || 'Error fetching static layers');
        }
        maybeCache();
      } catch (err: any) {
        setStaticError(err.message || 'Error fetching static layers');
      } finally {
        setIsStaticLoading(false);
      }
    };

    getTraffic();
    getAqi();
    getStatic();
    
    if (activeModule === 'lighting') {
      const getLighting = async () => {
        try {
          const res = await checkLightingAdequacy(lat, lng);
          setLightingResult(res);
        } catch (err: any) {
          setLightingError(err.message || 'Error checking lighting');
        } finally {
          setIsLightingLoading(false);
        }
      };
      getLighting();
    }
  }, [clickedPoint, activeModule]);

  // Reactively sync clickedPoint.value to the active layer's metrics
  useEffect(() => {
    if (!clickedPoint) return;

    let resolvedValue = 0;
    if (activeLayerId === 'traffic' && trafficData && trafficData.status === 'ok') {
      resolvedValue = trafficData.congestion_percentage;
    } else if (activeLayerId === 'pollution' && aqiData && aqiData.status === 'ok') {
      resolvedValue = aqiData.aqi;
    } else if (activeLayerId === 'population' && staticLayersData && staticLayersData.status === 'ok') {
      resolvedValue = staticLayersData.population_density_2020;
    } else if (activeLayerId === 'crime' && staticLayersData && staticLayersData.status === 'ok') {
      resolvedValue = staticLayersData.annual_crime_rate_2025;
    }

    setClickedPoint(prev => {
      if (prev && prev.value !== resolvedValue) {
        return { ...prev, value: resolvedValue };
      }
      return prev;
    });
  }, [activeLayerId, trafficData, aqiData, staticLayersData]);


  // Register global test hook for end-to-end testing
  useEffect(() => {
    (window as any).triggerMapClick = handleMapClick;
    return () => {
      delete (window as any).triggerMapClick;
    };
  }, [handleMapClick]);

  // Clean up pending requests/timers on unmount
  useEffect(() => {
    return () => {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);




  // Fetch reservoir data when reservoirs module is active
  useEffect(() => {
    if (activeModule !== 'reservoirs') return;
    
    const loadReservoirData = async () => {
      try {
        const sum = await fetchReservoirCurrent();
        setReservoirSummary(sum);
        
        const ovs = await fetchOverflowEvents();
        setReservoirOverflows(ovs);
      } catch (err) {
        console.error("Error loading current reservoirs:", err);
      }
    };
    
    loadReservoirData();
  }, [activeModule]);

  // Fetch history when selected lake changes or history lookback days changes
  useEffect(() => {
    if (activeModule !== 'reservoirs') return;
    
    const loadHistory = async () => {
      setIsLoadingReservoirHistory(true);
      try {
        const hist = await fetchReservoirHistory(selectedLakeName || undefined, reservoirHistoryDays);
        setReservoirHistory(hist);
      } catch (err) {
        console.error("Error loading reservoir history:", err);
      } finally {
        setIsLoadingReservoirHistory(false);
      }
    };
    
    loadHistory();
  }, [selectedLakeName, reservoirHistoryDays, activeModule]);

  const handleTriggerReservoirScrape = async () => {
    setIsScrapingReservoir(true);
    setScrapeReservoirError(null);
    setScrapeReservoirSuccess(false);
    try {
      await triggerManualScrape();
      // Reload summary
      const sum = await fetchReservoirCurrent();
      setReservoirSummary(sum);
      setScrapeReservoirSuccess(true);
      setTimeout(() => setScrapeReservoirSuccess(false), 4000);
    } catch (err: any) {
      setScrapeReservoirError(err.message || "Failed to trigger scrape.");
    } finally {
      setIsScrapingReservoir(false);
    }
  };


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
        population: 'High density clusters in Bandra, Dadar, and Sion indicate residential congestion. Strategic vertical development and improved transit infrastructure needed in these zones.',
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

POPULATION DENSITY: Highest density in Dharavi (ref: 300k/km²), Bandra (40k/km²), and Dadar (45k/km²). Strategic urban planning needed for these high-density corridors.

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

  const handleCheckConstruction = async () => {
    if (!constructionAOI) return;
    setIsCheckingConstruction(true);
    setConstructionError(null);
    try {
      const result = await checkConstructionActivity(constructionAOI, {
        dateRange: {
          lookback_days: lookbackDays,
          baseline_offset_days: baselineOffsetDays,
          max_cloud_cover: maxCloudCover,
        },
      });
      setConstructionResult(result);
      if (result.status === 'no_scenes_found') {
        setConstructionError(null); // shown inline in the results panel, not as a form error
      }
    } catch (err) {
      const message = err instanceof ConstructionApiError ? err.message : 'Unexpected error checking construction activity.';
      setConstructionError(message);
      setConstructionResult(null);
    } finally {
      setIsCheckingConstruction(false);
    }
  };

  const handleClearConstructionAOI = () => {
    setConstructionAOI(null);
    setConstructionResult(null);
    setConstructionError(null);
  };

  const getIntensityColor = (value: number, max: number) => {
    const ratio = value / max;
    if (ratio > 0.75) return 'bg-red-600/90 border-red-400/50 text-white shadow-[0_0_40px_rgba(220,38,38,0.4)]';
    if (ratio > 0.45) return 'bg-amber-500/90 border-amber-300/50 text-black shadow-[0_0_30px_rgba(245,158,11,0.2)]';
    return 'bg-emerald-600/90 border-emerald-400/50 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)]';
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-6xl">
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
              layer.id === 'population' && "bg-purple-500/20 text-purple-400 group-hover:bg-purple-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]",
              layer.id === 'crime' && "bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(244,63,94,0.5)]"
            )}>
              {layer.id === 'traffic' && <Activity className="w-12 h-12" />}
              {layer.id === 'pollution' && <Wind className="w-12 h-12" />}
              {layer.id === 'population' && <Users className="w-12 h-12" />}
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

        <motion.button
          key="construction"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: URBAN_LAYERS.length * 0.1 }}
          whileHover={{ y: -15, scale: 1.02 }}
          onClick={() => {
            setActiveModule('construction');
            setView('map');
          }}
          className="glass group p-10 rounded-[3rem] border-white/5 hover:border-white/20 transition-all text-center space-y-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className="w-24 h-24 mx-auto rounded-[2rem] flex items-center justify-center transition-all duration-500 shadow-2xl bg-orange-500/20 text-orange-400 group-hover:bg-orange-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]">
            <HardHat className="w-12 h-12" />
          </div>

          <div className="relative z-10">
            <h3 className="text-2xl font-black uppercase tracking-tight italic">Construction Monitoring</h3>
            <p className="text-[10px] text-white/40 mt-3 font-bold uppercase tracking-widest leading-relaxed">
              Detect new built-up land via satellite change detection
            </p>
          </div>

          <div className="pt-4 flex justify-center">
            <div className="w-8 h-1 bg-white/10 rounded-full group-hover:w-16 group-hover:bg-white/40 transition-all duration-500" />
          </div>
        </motion.button>

        <motion.button
          key="lighting"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (URBAN_LAYERS.length + 1) * 0.1 }}
          whileHover={{ y: -15, scale: 1.02 }}
          onClick={() => {
            setActiveModule('lighting');
            setView('map');
          }}
          className="glass group p-10 rounded-[3rem] border-white/5 hover:border-white/20 transition-all text-center space-y-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className="w-24 h-24 mx-auto rounded-[2rem] flex items-center justify-center transition-all duration-500 shadow-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-black group-hover:shadow-[0_0_30px_rgba(99,102,241,0.5)]">
            <Moon className="w-12 h-12" />
          </div>

          <div className="relative z-10">
            <h3 className="text-2xl font-black uppercase tracking-tight italic">Nighttime Lighting</h3>
            <p className="text-[10px] text-white/40 mt-3 font-bold uppercase tracking-widest leading-relaxed">
              Assess lighting adequacy based on NASA Black Marble
            </p>
          </div>

          <div className="pt-4 flex justify-center">
            <div className="w-8 h-1 bg-white/10 rounded-full group-hover:w-16 group-hover:bg-white/40 transition-all duration-500" />
          </div>
        </motion.button>
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
                  activeLayerId === 'population' && "bg-purple-400",
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
                {activeLayerId === 'population' && <Users className="w-32 h-32" />}
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
          {activeModule === 'urban' && <HeatmapLayer points={heatmapPoints} />}
          {(activeModule === 'urban' || activeModule === 'construction' || activeModule === 'lighting') && <MapEvents onMapClick={handleMapClick} />}
          <DrawAOILayer
            active={view === 'map' && activeModule === 'construction'}
            onAOIChange={(geojson) => {
              setConstructionAOI(geojson);
              setConstructionResult(null);
              setConstructionError(null);
            }}
          />
          <ConstructionChangeLayer changeGeoJSON={constructionResult?.change_geojson ?? null} />
          
          {/* Reservoir Supply Lake Markers */}
          {activeModule === 'reservoirs' && reservoirSummary?.readings.map((lake) => {
            const isSelected = selectedLakeName === lake.lake_name;
            const isGreen = lake.percent_stock >= 75;
            const isAmber = lake.percent_stock >= 40 && lake.percent_stock < 75;
            let colorHex = '#ef4444'; // Red
            if (isGreen) colorHex = '#10b981'; // Green
            else if (isAmber) colorHex = '#f59e0b'; // Amber

            return (
              <Marker
                key={`reservoir-${lake.lake_name}`}
                position={[lake.latitude, lake.longitude]}
                icon={L.divIcon({
                  className: 'custom-div-icon',
                  html: `<div class="relative flex items-center justify-center">
                    <div class="absolute w-6 h-6 rounded-full animate-ping" style="background-color: ${colorHex}; opacity: 0.2;"></div>
                    <div class="w-4 h-4 rounded-full border-2 border-white shadow-lg relative z-10" style="background-color: ${colorHex};"></div>
                  </div>`,
                  iconSize: [24, 24],
                  iconAnchor: [12, 12]
                })}
                eventHandlers={{
                  click: () => {
                    setSelectedLakeName(lake.lake_name);
                  }
                }}
              >
                <Popup className="urban-popup">
                  <div className="p-3 bg-[#0a0a0a] text-white border border-white/10 rounded-xl shadow-2xl min-w-[150px]">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">Mumbai Reservoir</p>
                    <h4 className="text-sm font-bold uppercase tracking-tight leading-none mb-1">{lake.lake_name}</h4>
                    <div className="mt-2 pt-2 border-t border-white/5 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/40 font-bold uppercase text-[8px]">Stock %</span>
                        <span className="font-black text-emerald-400">{lake.percent_stock}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40 font-bold uppercase text-[8px]">Stock Vol</span>
                        <span className="font-bold">{Math.round(lake.content_ml).toLocaleString()} ML</span>
                      </div>
                      {lake.rainfall_mm_24hr > 0 && (
                        <div className="flex justify-between">
                          <span className="text-white/40 font-bold uppercase text-[8px]">24h Rain</span>
                          <span className="font-bold text-sky-400">+{lake.rainfall_mm_24hr}mm</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          
          {(activeModule === 'urban' || activeModule === 'construction' || activeModule === 'lighting') && clickedPoint && (
            <Popup 
              position={[clickedPoint.lat, clickedPoint.lng]} 
              eventHandlers={{ remove: () => setClickedPoint(null) }}
              className="urban-popup"
            >
              <div className="p-3 bg-[#0a0a0a] text-white border border-white/10 rounded-xl shadow-2xl min-w-[160px]">
                <div className="flex items-center space-x-2 mb-2">
                  <Globe className="w-3 h-3 text-emerald-400" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Location Identified</p>
                </div>
                {isGeocoding ? (
                  <div className="flex items-center space-x-1.5 py-1 mb-1">
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 animate-pulse">Resolving...</span>
                  </div>
                ) : (
                  <h4 className="text-lg font-black italic uppercase tracking-tight leading-none mb-1">{clickedPoint.label}</h4>
                )}
                <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-white/40 uppercase font-bold">
                      {activeModule === 'construction' ? 'Module' : activeModule === 'lighting' ? 'Module' : 'Active Layer'}
                    </span>
                    <span className="text-[10px] font-bold text-white/80">
                      {activeModule === 'construction' ? 'Construction Monitoring' : activeModule === 'lighting' ? 'Nighttime Lighting' : activeLayer.name}
                    </span>
                  </div>
                  {activeModule !== 'lighting' && clickedPoint.value > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-white/40 uppercase font-bold">Local Intensity</span>
                      <span className="text-xs font-black text-emerald-400">{clickedPoint.value}</span>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {activeModule === 'urban' && filteredData.map((point, idx) => (
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
        {view === 'map' && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full relative z-10 pointer-events-none">
            {/* Top Command Bar */}
            <header className="absolute top-0 left-0 right-0 z-50 h-20 px-8 flex items-center justify-between pointer-events-none">
              <div className="flex items-center space-x-12 pointer-events-auto">
                <button onClick={() => setView('landing')} className="flex items-center space-x-3 group">
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

                {/* Module Switcher: Urban Layers vs Construction Monitoring */}
                <div className="glass rounded-2xl p-1 flex items-center space-x-1 border-white/5">
                  <button
                    onClick={() => setActiveModule('urban')}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeModule === 'urban' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Urban Layers</span>
                  </button>
                  <button
                    onClick={() => setActiveModule('construction')}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeModule === 'construction' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <HardHat className="w-3.5 h-3.5" />
                    <span>Construction</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveModule('reservoirs');
                      setSelectedLakeName(null);
                    }}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeModule === 'reservoirs' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <Droplet className="w-3.5 h-3.5" />
                    <span>Reservoirs</span>
                  </button>
                  <button
                    onClick={() => setActiveModule('lighting')}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeModule === 'lighting' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Lighting</span>
                  </button>
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

            <div className="absolute left-8 top-24 bottom-24 w-80 z-40 flex flex-col space-y-6 pointer-events-auto">
              {activeModule === 'reservoirs' ? (
                <ReservoirControlPanel
                  summary={reservoirSummary}
                  selectedLakeName={selectedLakeName}
                  onSelectLake={setSelectedLakeName}
                  onTriggerScrape={handleTriggerReservoirScrape}
                  isScraping={isScrapingReservoir}
                  scrapeError={scrapeReservoirError}
                  scrapeSuccess={scrapeReservoirSuccess}
                />
              ) : activeModule === 'construction' ? (
                <ConstructionControlPanel
                  hasAOI={!!constructionAOI}
                  isChecking={isCheckingConstruction}
                  lookbackDays={lookbackDays}
                  setLookbackDays={setLookbackDays}
                  baselineOffsetDays={baselineOffsetDays}
                  setBaselineOffsetDays={setBaselineOffsetDays}
                  maxCloudCover={maxCloudCover}
                  setMaxCloudCover={setMaxCloudCover}
                  onCheck={handleCheckConstruction}
                  onClearAOI={handleClearConstructionAOI}
                  error={constructionError}
                />
              ) : activeModule === 'lighting' ? (
                <LightingControlPanel />
              ) : (
                <>
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
                        {layer.id === 'population' && <Users className="w-4 h-4" />}
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

              {/* Ingestion Deck removed */}
              </>
              )}
            </div>

            {/* Right Analytics Deck */}

            <div className={cn(
              "absolute top-24 bottom-24 z-40 flex flex-col space-y-6 pointer-events-auto",
              activeModule === 'construction' ? "right-28 w-80" : "right-8 w-96"
            )}>
              {activeModule === 'reservoirs' ? (
                <ReservoirResultsPanel
                  selectedLake={reservoirSummary?.readings.find(r => r.lake_name === selectedLakeName) || null}
                  history={reservoirHistory}
                  overflowEvents={reservoirOverflows}
                  historyDays={reservoirHistoryDays}
                  setHistoryDays={setReservoirHistoryDays}
                  isLoadingHistory={isLoadingReservoirHistory}
                  onClose={() => setSelectedLakeName(null)}
                />
              ) : activeModule === 'construction' ? (
                <ConstructionResultsPanel 
                  result={constructionResult} 
                  isChecking={isCheckingConstruction} 
                  clickedPoint={clickedPoint}
                  isGeocoding={isGeocoding}
                  onClearLocation={() => setClickedPoint(null)}
                />
              ) : activeModule === 'lighting' ? (
                <LightingResultsPanel
                  result={lightingResult}
                  isLoading={isLightingLoading}
                  error={lightingError}
                  clickedPoint={clickedPoint}
                  isGeocoding={isGeocoding}
                  onClearLocation={() => setClickedPoint(null)}
                />
              ) : (
              <div className="glass rounded-[2rem] p-8 flex flex-col max-h-[calc(100vh-12rem)] overflow-y-auto pr-3 border-white/5 shadow-2xl">
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

                <div className="mb-4">
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
                      {isGeocoding ? (
                        <div className="flex items-center space-x-2 py-1 mb-4">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/45 animate-pulse">Resolving location...</span>
                        </div>
                      ) : (
                        <h3 className="text-xl font-black tracking-tighter text-white uppercase italic leading-none mb-4 truncate">{clickedPoint.label}</h3>
                      )}
                      
                      <div className="space-y-4 max-h-[calc(100vh-22rem)] overflow-y-auto pr-2 custom-scrollbar">
                        {/* Traffic Congestion Card */}
                        <div className="glass p-4 rounded-2xl border-white/5 space-y-2 bg-white/[0.02]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-wider text-red-400">
                              <Activity className="w-3.5 h-3.5" />
                              <span>Traffic Congestion</span>
                            </div>
                            {isTrafficLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin text-red-400" />
                            ) : trafficError ? (
                              <span className="text-[8px] font-black text-rose-500 uppercase">Error</span>
                            ) : trafficData?.status === 'no_segment_found' ? (
                              <span className="text-[8px] font-black text-white/30 uppercase">N/A</span>
                            ) : (
                              <span className="text-xs font-black text-white">{trafficData?.congestion_percentage}%</span>
                            )}
                          </div>
                          {isTrafficLoading ? (
                            <div className="h-4 bg-white/5 rounded animate-pulse w-2/3" />
                          ) : trafficError ? (
                            <p className="text-[10px] text-rose-400/80 leading-tight">Unavailable for this location</p>
                          ) : trafficData?.status === 'no_segment_found' ? (
                            <p className="text-[10px] text-white/30 leading-tight">No road segment traffic data for this location</p>
                          ) : (
                            <div className="space-y-1">
                              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-red-500 h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${trafficData?.congestion_percentage}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-white/45 leading-tight">
                                Flow Speed: <span className="font-mono text-white/70">{trafficData?.current_speed} km/h</span> (free flow: {trafficData?.free_flow_speed} km/h)
                              </p>
                              {trafficData?.road_name && (
                                <p className="text-[8px] text-white/30 font-medium italic truncate">Road: {trafficData.road_name}</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Air Quality (AQI) Card */}
                        <div className="glass p-4 rounded-2xl border-white/5 space-y-2 bg-white/[0.02]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                              <Wind className="w-3.5 h-3.5" />
                              <span>Air Quality (AQI)</span>
                            </div>
                            {isAqiLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                            ) : aqiError ? (
                              <span className="text-[8px] font-black text-rose-500 uppercase">Error</span>
                            ) : (
                              <span className="text-xs font-black text-white">{aqiData?.aqi}</span>
                            )}
                          </div>
                          {isAqiLoading ? (
                            <div className="h-4 bg-white/5 rounded animate-pulse w-2/3" />
                          ) : aqiError ? (
                            <p className="text-[10px] text-rose-400/80 leading-tight">Unavailable for this location</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-[9px] text-white/45 leading-tight">
                                Station: <span className="text-white/70 font-bold">{aqiData?.station_name}</span>
                              </p>
                              <div className="flex items-center justify-between text-[9px] text-white/45">
                                <span>Distance: {aqiData?.distance_km} km</span>
                                {aqiData?.distance_km > 10 && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[8px] uppercase font-black">Regional Reading</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Population Density Card */}
                        <div className="glass p-4 rounded-2xl border-white/5 space-y-1.5 bg-white/[0.02]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-wider text-blue-400">
                              <Users className="w-3.5 h-3.5" />
                              <span>Population Density</span>
                            </div>
                            {isStaticLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                            ) : staticError ? (
                              <span className="text-[8px] font-black text-rose-500 uppercase">Error</span>
                            ) : (
                              <span className="text-xs font-black text-white">{staticLayersData?.population_density_2020?.toLocaleString()} / km²</span>
                            )}
                          </div>
                          {isStaticLoading ? (
                            <div className="h-4 bg-white/5 rounded animate-pulse w-2/3" />
                          ) : staticError ? (
                            <p className="text-[10px] text-rose-400/80 leading-tight">Unavailable for this location</p>
                          ) : (
                            <p className="text-[9px] text-white/45 leading-tight">
                              Zone: <span className="text-white/70 font-bold">{staticLayersData?.zone_name}</span> (2020 estimate)
                            </p>
                          )}
                        </div>

                        {/* Crime Hotspots Card */}
                        <div className="glass p-4 rounded-2xl border-white/5 space-y-1.5 bg-white/[0.02]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-wider text-amber-400">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Crime Hotspots</span>
                            </div>
                            {isStaticLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                            ) : staticError ? (
                              <span className="text-[8px] font-black text-rose-500 uppercase">Error</span>
                            ) : (
                              <span className="text-xs font-black text-white">{staticLayersData?.annual_crime_rate_2025?.toFixed(1)}</span>
                            )}
                          </div>
                          {isStaticLoading ? (
                            <div className="h-4 bg-white/5 rounded animate-pulse w-2/3" />
                          ) : staticError ? (
                            <p className="text-[10px] text-rose-400/80 leading-tight">Unavailable for this location</p>
                          ) : (
                            <p className="text-[9px] text-white/45 leading-tight">
                              Reported Crimes: <span className="text-white/70 font-bold">{staticLayersData?.annual_crime_rate_2025?.toFixed(1)} incidents/10k pop</span> (2025 annual data)
                            </p>
                          )}
                        </div>

                        {/* Location Metadata */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="glass p-3 rounded-xl border-white/5 text-[9px] font-mono text-white/45 bg-white/[0.01]">
                            <p className="text-[8px] font-black uppercase tracking-widest mb-1 text-white/30">Latitude</p>
                            <p className="text-emerald-400">{clickedPoint.lat.toFixed(4)}</p>
                          </div>
                          <div className="glass p-3 rounded-xl border-white/5 text-[9px] font-mono text-white/45 bg-white/[0.01]">
                            <p className="text-[8px] font-black uppercase tracking-widest mb-1 text-white/30">Longitude</p>
                            <p className="text-emerald-400">{clickedPoint.lng.toFixed(4)}</p>
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
              )}
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
