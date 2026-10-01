import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

interface ConstructionChangeLayerProps {
  changeGeoJSON: GeoJSON.FeatureCollection | null;
}

// Renders NDBI-change polygons returned by /api/construction/check.
// Fill opacity scales with each polygon's area (properties.area_m2) relative
// to the largest polygon in the response, as a proxy for change magnitude/
// confidence — bigger contiguous patches of new built-up land read as more
// visually significant than scattered small ones.
export default function ConstructionChangeLayer({ changeGeoJSON }: ConstructionChangeLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!changeGeoJSON || changeGeoJSON.features.length === 0) return;

    const maxArea = Math.max(
      ...changeGeoJSON.features.map((f) => f.properties?.area_m2 ?? 0),
      1
    );

    const layer = L.geoJSON(changeGeoJSON, {
      style: (feature) => {
        const area = feature?.properties?.area_m2 ?? 0;
        const intensity = Math.min(area / maxArea, 1);
        return {
          color: '#f97316',
          weight: 1.5,
          fillColor: '#f97316',
          fillOpacity: 0.25 + intensity * 0.45, // 0.25 - 0.70 range
        };
      },
      onEachFeature: (feature, l) => {
        const area = feature.properties?.area_m2;
        if (area != null) {
          l.bindTooltip(`New built-up area: ~${Math.round(area).toLocaleString()} m²`, {
            sticky: true,
            className: 'construction-tooltip',
          });
        }
      },
    }).addTo(map);

    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, changeGeoJSON]);

  return null;
}
