import math
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query
import httpx
from app.config import settings
from app.db import get_nearest_zone

router = APIRouter(prefix="/urban", tags=["urban"])

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

@router.get("/traffic")
async def get_traffic(lat: float = Query(...), lng: float = Query(...)):
    # Fallback to deterministic mock if TomTom API key is missing
    if not settings.TOMTOM_API_KEY:
        h = abs(hash(f"{lat:.4f},{lng:.4f}"))
        mock_congestion = float(h % 85)  # Max 85% congestion
        mock_speed = float(20 + (h % 50))
        mock_free_flow = float(80)
        
        # Check if user clicked in open water (using raw coordinates mapping)
        # Approximate bounds for Mumbai bay/sea areas
        if lng < 72.805 or (lat < 18.96 and lng < 72.825):
            return {
                "status": "no_segment_found",
                "message": "No road segment found (clicked in open water/sea)."
            }
            
        return {
            "status": "ok",
            "congestion_percentage": mock_congestion,
            "current_speed": mock_speed,
            "free_flow_speed": mock_free_flow,
            "road_name": f"Mumbai Road Segment {(h % 300) + 1}",
            "is_mock": True
        }

    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lng}&key={settings.TOMTOM_API_KEY}"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, timeout=5.0)
            if r.status_code != 200:
                return {
                    "status": "error",
                    "message": f"TomTom API error (status code {r.status_code})"
                }
            
            data = r.json()
            if "flowSegmentData" not in data:
                return {
                    "status": "no_segment_found",
                    "message": "No road segment found near coordinates."
                }
            
            flow = data["flowSegmentData"]
            current_speed = flow.get("currentSpeed", 0)
            free_flow_speed = flow.get("freeFlowSpeed", 0)
            
            if free_flow_speed <= 0:
                congestion = 0.0
            else:
                congestion = (1 - (current_speed / free_flow_speed)) * 100
                congestion = max(0.0, min(100.0, congestion))
            
            road_name = flow.get("description", "Unnamed Road segment")
            
            return {
                "status": "ok",
                "congestion_percentage": round(congestion, 1),
                "current_speed": current_speed,
                "free_flow_speed": free_flow_speed,
                "road_name": road_name,
                "is_mock": False
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@router.get("/aqi")
async def get_aqi(lat: float = Query(...), lng: float = Query(...)):
    # Fallback to deterministic mock if WAQI API key is missing
    if not settings.WAQI_API_KEY:
        h = abs(hash(f"{lat:.4f},{lng:.4f}"))
        mock_aqi = int(45 + (h % 230))  # AQI between 45 and 275
        station_names = ["Bandra East", "Dharavi Sector 3", "Colaba Coastal", "Kurla West", "Sion Circle", "Andheri West link"]
        mock_station = station_names[h % len(station_names)]
        
        # Clicked in open sea: make station distance larger
        if lng < 72.805 or (lat < 18.96 and lng < 72.825):
            mock_distance = round(float(12.5 + (h % 80) / 10.0), 1)  # 12.5 to 20.5 km
        else:
            mock_distance = round(float(0.5 + (h % 45) / 10.0), 1)   # 0.5 to 5.0 km
            
        return {
            "status": "ok",
            "aqi": mock_aqi,
            "station_name": f"{mock_station} Air Quality Station",
            "distance_km": mock_distance,
            "is_mock": True
        }

    url = f"https://api.waqi.info/feed/geo:{lat};{lng}/?token={settings.WAQI_API_KEY}"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, timeout=5.0)
            if r.status_code != 200:
                return {
                    "status": "error",
                    "message": f"WAQI API returned status code {r.status_code}"
                }
            
            data = r.json()
            if data.get("status") != "ok" or "data" not in data:
                return {
                    "status": "error",
                    "message": data.get("data", "Unknown WAQI API error")
                }
            
            aqi_data = data["data"]
            aqi = aqi_data.get("aqi")
            
            try:
                aqi = int(aqi)
            except (ValueError, TypeError):
                aqi = 0
                
            city = aqi_data.get("city", {})
            station_name = city.get("name", "Unknown Station")
            
            # Calculate distance to station coordinates
            geo = city.get("geo", [])
            distance = 0.0
            if len(geo) >= 2:
                try:
                    stat_lat, stat_lng = float(geo[0]), float(geo[1])
                    distance = round(haversine(lat, lng, stat_lat, stat_lng), 1)
                except ValueError:
                    pass
            
            return {
                "status": "ok",
                "aqi": aqi,
                "station_name": station_name,
                "distance_km": distance,
                "is_mock": False
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@router.get("/static-layers")
async def get_static_layers(lat: float = Query(...), lng: float = Query(...)):
    try:
        zone = get_nearest_zone(lat, lng)
        if not zone:
            return {
                "status": "error",
                "message": "No zone mapping available in database."
            }
        return {
            "status": "ok",
            "zone_name": zone["zone_name"],
            "population_density_2020": zone["population_density"],
            "annual_crime_rate_2025": zone["crime_rate"]
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
