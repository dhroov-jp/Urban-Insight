export interface DataPoint {
  latitude: number;
  longitude: number;
  value: number;
  label?: string;
  timestamp?: string;
  category?: string;
}

export interface LayerConfig {
  id: string;
  name: string;
  color: string;
  description: string;
  unit: string;
  maxValue: number;
  criticalThreshold: number;
}

export const URBAN_LAYERS: LayerConfig[] = [
  { 
    id: 'traffic', 
    name: 'Traffic Congestion', 
    color: '#ef4444', 
    description: 'Real-time traffic flow and congestion hotspots.',
    unit: '% Congestion',
    maxValue: 100,
    criticalThreshold: 80
  },
  { 
    id: 'pollution', 
    name: 'Air Quality (AQI)', 
    color: '#10b981', 
    description: 'Pollution levels and particulate matter distribution.',
    unit: 'AQI',
    maxValue: 500,
    criticalThreshold: 200
  },
  { 
    id: 'population', 
    name: 'Population Density', 
    color: '#3b82f6', 
    description: 'Residential and commercial density patterns.',
    unit: 'persons/km²',
    maxValue: 300000,
    criticalThreshold: 100000
  },
  { 
    id: 'crime', 
    name: 'Crime Hotspots', 
    color: '#f59e0b', 
    description: 'Frequency of reported incidents in urban areas.',
    unit: 'incidents/10k pop',
    maxValue: 100,
    criticalThreshold: 50
  },
];

export const INITIAL_DATA: Record<string, DataPoint[]> = {
  traffic: [
    { latitude: 19.0596, longitude: 72.8295, value: 80, label: 'Bandra West' },
    { latitude: 19.0645, longitude: 72.8350, value: 95, label: 'Bandra Station' },
    { latitude: 19.0650, longitude: 72.8360, value: 100, label: 'Bandra Junction' },
    { latitude: 19.0640, longitude: 72.8340, value: 98, label: 'Bandra Link Road' },
    { latitude: 19.0550, longitude: 72.8200, value: 70, label: 'Carter Road' },
    { latitude: 19.1136, longitude: 72.8697, value: 60, label: 'Andheri East' },
    { latitude: 19.1150, longitude: 72.8600, value: 95, label: 'Andheri Station' },
    { latitude: 19.1160, longitude: 72.8610, value: 100, label: 'Andheri Flyover' },
    { latitude: 19.1200, longitude: 72.8750, value: 90, label: 'MIDC' },
    { latitude: 19.1197, longitude: 72.9051, value: 30, label: 'Powai Lake' },
    { latitude: 19.1250, longitude: 72.9150, value: 45, label: 'IIT Bombay' },
    { latitude: 18.9220, longitude: 72.8347, value: 95, label: 'Colaba' },
    { latitude: 18.9230, longitude: 72.8350, value: 100, label: 'Gateway Area' },
    { latitude: 18.9350, longitude: 72.8300, value: 80, label: 'Fort' },
    { latitude: 19.0760, longitude: 72.8777, value: 75, label: 'Kurla' },
    { latitude: 19.0850, longitude: 72.8900, value: 95, label: 'BKC' },
    { latitude: 19.0860, longitude: 72.8910, value: 100, label: 'BKC Hub' },
    { latitude: 19.0700, longitude: 72.8600, value: 65, label: 'Dharavi' },
    { latitude: 19.0400, longitude: 72.8150, value: 55, label: 'Mahim' },
    { latitude: 19.0200, longitude: 72.8400, value: 90, label: 'Dadar' },
    { latitude: 19.0210, longitude: 72.8410, value: 100, label: 'Dadar TT' },
  ],
  pollution: [
    { latitude: 19.0596, longitude: 72.8295, value: 45, label: 'Bandra' },
    { latitude: 19.0650, longitude: 72.8400, value: 120, label: 'Bandra East' },
    { latitude: 19.1136, longitude: 72.8697, value: 185, label: 'Andheri' },
    { latitude: 19.1140, longitude: 72.8700, value: 250, label: 'Andheri Industrial' },
    { latitude: 19.1150, longitude: 72.8710, value: 280, label: 'Andheri Factory Zone' },
    { latitude: 19.1000, longitude: 72.8800, value: 160, label: 'Saki Naka' },
    { latitude: 19.1010, longitude: 72.8810, value: 240, label: 'Saki Naka Junction' },
    { latitude: 19.1197, longitude: 72.9051, value: 40, label: 'Powai' },
    { latitude: 18.9220, longitude: 72.8347, value: 55, label: 'Colaba' },
    { latitude: 19.0760, longitude: 72.8777, value: 190, label: 'Kurla' },
    { latitude: 19.0770, longitude: 72.8780, value: 260, label: 'Kurla Industrial' },
    { latitude: 19.0900, longitude: 72.8500, value: 140, label: 'Santacruz' },
    { latitude: 19.0100, longitude: 72.8600, value: 110, label: 'Wadala' },
    { latitude: 19.1500, longitude: 72.8500, value: 130, label: 'Goregaon' },
  ],
  population: [
    { latitude: 19.0596, longitude: 72.8295, value: 70, label: 'Bandra' },
    { latitude: 19.0600, longitude: 72.8300, value: 85, label: 'Bandra Central' },
    { latitude: 19.0590, longitude: 72.8290, value: 95, label: 'Bandra West' },
    { latitude: 19.0580, longitude: 72.8280, value: 100, label: 'Bandra Highrise' },
    { latitude: 19.1136, longitude: 72.8697, value: 90, label: 'Andheri' },
    { latitude: 19.1140, longitude: 72.8700, value: 80, label: 'Andheri Hub' },
    { latitude: 19.1197, longitude: 72.9051, value: 40, label: 'Powai' },
    { latitude: 18.9220, longitude: 72.8347, value: 85, label: 'Colaba' },
    { latitude: 19.0760, longitude: 72.8777, value: 95, label: 'Kurla' },
    { latitude: 19.0750, longitude: 72.8770, value: 90, label: 'Kurla West' },
    { latitude: 19.0770, longitude: 72.8780, value: 85, label: 'Kurla East' },
    { latitude: 19.0300, longitude: 72.8500, value: 100, label: 'Sion' },
    { latitude: 19.0310, longitude: 72.8510, value: 110, label: 'Sion Circle' },
    { latitude: 19.0400, longitude: 72.8600, value: 95, label: 'Chunabhatti' },
  ],
  crime: [
    { latitude: 19.0596, longitude: 72.8295, value: 20, label: 'Bandra' },
    { latitude: 19.1136, longitude: 72.8697, value: 40, label: 'Andheri' },
    { latitude: 19.1197, longitude: 72.9051, value: 10, label: 'Powai' },
    { latitude: 18.9220, longitude: 72.8347, value: 30, label: 'Colaba' },
    { latitude: 19.0760, longitude: 72.8777, value: 50, label: 'Kurla' },
    { latitude: 19.0800, longitude: 72.8800, value: 65, label: 'Mankhurd' },
    { latitude: 19.0810, longitude: 72.8810, value: 90, label: 'Mankhurd Slums' },
    { latitude: 19.0820, longitude: 72.8820, value: 95, label: 'Mankhurd High Risk' },
    { latitude: 19.0500, longitude: 72.8500, value: 45, label: 'Govandi' },
    { latitude: 19.0510, longitude: 72.8510, value: 85, label: 'Govandi Station' },
  ]
};
