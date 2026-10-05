import { useEffect } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeocodingResult } from '../lib/geocoding';

interface MapSearchMarkerProps {
  location: GeocodingResult | null;
  onSelect: (location: GeocodingResult) => void;
}

const searchMarkerIcon = L.divIcon({
  className: 'custom-div-icon search-location-icon',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-10 h-10 rounded-full border border-emerald-300/70 animate-ping"></div>
    <div class="absolute w-7 h-7 rounded-full bg-emerald-400/30 border border-emerald-300/80"></div>
    <div class="relative z-10 w-3.5 h-3.5 rounded-full bg-emerald-300 border-2 border-white shadow-[0_0_18px_rgba(16,185,129,0.95)]"></div>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

export function MapSearchMarker({ location, onSelect }: MapSearchMarkerProps) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;
    map.flyTo([location.latitude, location.longitude], 15, {
      animate: true,
      duration: 1.2,
    });
  }, [location, map]);

  if (!location) return null;

  return (
    <Marker
      position={[location.latitude, location.longitude]}
      icon={searchMarkerIcon}
      eventHandlers={{
        click: (event) => {
          event.originalEvent.stopPropagation();
          onSelect(location);
        },
      }}
    />
  );
}
