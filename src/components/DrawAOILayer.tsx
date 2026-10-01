import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

interface DrawAOILayerProps {
  active: boolean;
  onAOIChange: (geojson: GeoJSON.Polygon | null) => void;
}

// Lets the user draw exactly one rectangle or polygon AOI on the map.
// Drawing a new shape replaces the previous one (single-AOI workflow, matching
// the "draw an area, then check it" flow rather than a general annotation tool).
export default function DrawAOILayer({ active, onAOIChange }: DrawAOILayerProps) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    if (!map) return;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: 'bottomright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#10b981', weight: 2, fillOpacity: 0.1 },
        },
        rectangle: {
          shapeOptions: { color: '#10b981', weight: 2, fillOpacity: 0.1 },
        },
        // Not relevant to an AOI-selection workflow:
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    drawControlRef.current = drawControl;

    const emitAOI = () => {
      const layers = drawnItems.getLayers();
      if (layers.length === 0) {
        onAOIChange(null);
        return;
      }
      // Only one AOI at a time — use the most recent shape.
      const layer = layers[layers.length - 1] as L.Polygon;
      const geojson = layer.toGeoJSON().geometry as GeoJSON.Polygon;
      onAOIChange(geojson);
    };

    const handleCreated = (e: any) => {
      drawnItems.clearLayers(); // enforce single-AOI: new shape replaces the old one
      drawnItems.addLayer(e.layer);
      emitAOI();
    };
    const handleEdited = () => emitAOI();
    const handleDeleted = () => emitAOI();

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeLayer(drawnItems);
      drawnItemsRef.current = null;
      drawControlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Toggle the draw toolbar's visibility based on whether Construction mode is active.
  useEffect(() => {
    if (!map || !drawControlRef.current) return;
    if (active) {
      map.addControl(drawControlRef.current);
      // Move the draw toolbar slightly up from the bottom so it doesn't overlap
      // with the top-right admin widgets when displayed in the application's
      // chrome. 72px works well for the current layout but can be adjusted.
      try {
        const container = (drawControlRef.current as any)?._container as HTMLElement | undefined;
        if (container) {
          container.style.bottom = '72px';
        }
      } catch (e) {
        // Non-fatal: if the DOM shape differs, ignore.
      }
    } else {
      map.removeControl(drawControlRef.current);
    }
  }, [active, map]);

  return null;
}
