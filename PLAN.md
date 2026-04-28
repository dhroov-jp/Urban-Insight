# Urban Heatmap Visualization System - Technical Implementation Plan

## 1. System Architecture

The platform follows a modern decoupled architecture optimized for geospatial performance.

### Text-Based Architecture Diagram
```
[ User Interface (React + Tailwind) ]
          |
          v
[ State Management (React Hooks) ] <---- [ Data Ingestion (PapaParse CSV) ]
          |
          v
[ Visualization Layer (Leaflet.js + Leaflet.heat) ]
          |
          v
[ Map Engine (OpenStreetMap Tiles) ]
```

- **Frontend**: React 19 for component-based UI.
- **Map Engine**: Leaflet.js for lightweight, mobile-friendly interactive maps.
- **Visualization Layer**: `Leaflet.heat` plugin for high-performance canvas-based heatmap rendering.
- **Styling**: Tailwind CSS for a responsive, "Smart City" dashboard aesthetic.

## 2. Data Processing Workflow

1.  **Ingestion**: Users upload CSV files via a drag-and-drop interface.
2.  **Parsing**: `PapaParse` converts raw CSV strings into JSON objects.
3.  **Validation**: The system checks for the existence of `latitude`, `longitude`, and `value` fields.
4.  **Normalization**: Values are scaled relative to the dataset's maximum to ensure consistent heatmap intensity across different metrics (e.g., pollution vs. population).
5.  **Coordinate Mapping**: Data points are transformed into Leaflet `LatLng` objects.

## 3. Heatmap Rendering Logic

The system uses a weighted Gaussian distribution for each point.
- **Gradient Mapping**:
  - `0.0 - 0.4`: Green (Low intensity)
  - `0.4 - 0.7`: Yellow (Medium intensity)
  - `0.7 - 1.0`: Red (High intensity)
- **Parameters**:
  - **Radius**: 25px (adjustable based on zoom level).
  - **Blur**: 15px for smooth transitions.
  - **Opacity**: 0.8 to maintain visibility of underlying map features.

## 4. Interactive Features

- **Zoom/Pan**: Native Leaflet interactions with hardware acceleration.
- **Hotspot Inspection**: Invisible hit-testing or marker overlays allow users to click on specific areas to see raw metrics in a side panel.
- **Dynamic Tooltips**: Hover states provide immediate feedback on local intensity values.

## 5. Dataset Specifications

### Required CSV Structure
```csv
latitude,longitude,value,timestamp,label
19.0596,72.8295,80,2023-10-01T12:00:00,Bandra
19.1136,72.8697,60,2023-10-01T12:00:00,Andheri
```

## 6. Multi-Layer Management

The system supports toggling between thematic layers:
- **Traffic**: Real-time congestion indices.
- **Pollution**: AQI (Air Quality Index) readings.
- **Population**: Density per square kilometer.
- **Crime**: Incident frequency hotspots.

## 7. Filtering Mechanisms

- **Time Filter**: A range slider to analyze patterns over specific hours or days.
- **Threshold Filter**: A "Noise Reduction" slider that hides data points below a certain intensity (e.g., "Only show AQI > 100").
- **Geographic Bounds**: Automatic filtering based on the current map viewport to optimize rendering performance.
