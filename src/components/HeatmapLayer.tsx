import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
// @ts-ignore
import 'leaflet.heat/dist/leaflet-heat.js';

interface HeatmapLayerProps {
  points: [number, number, number][]; // [lat, lng, intensity]
}

// Extend Leaflet to include heatLayer
declare module 'leaflet' {
  function heatLayer(
    latlngs: (L.LatLng | [number, number, number])[],
    options?: any
  ): L.Layer;
}

export default function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return;

    // @ts-ignore - Ensure L.heatLayer is available
    if (typeof L.heatLayer !== 'function') {
      console.error('L.heatLayer is not a function. Check if leaflet.heat is correctly loaded.');
      return;
    }

    const heat = L.heatLayer(points, {
      radius: 50, // Slightly larger radius for better clustering
      blur: 30,
      maxZoom: 17,
      minOpacity: 0.5, // Higher base opacity
      gradient: {
        0.1: '#00ffff', // Cyan (Very Low)
        0.3: '#00ff00', // Green
        0.5: '#ffff00', // Yellow
        0.7: '#ff8c00', // Dark Orange
        0.85: '#ff0000', // Red
        1.0: '#8b0000'  // Dark Red (Extreme)
      }
    }).addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);

  return null;
}
