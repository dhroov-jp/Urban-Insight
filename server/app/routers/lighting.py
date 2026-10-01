from fastapi import APIRouter, Query
from ..models import LightingCheckResponse, LightingClassification
from .. import db

router = APIRouter()

@router.get("/check", response_model=LightingCheckResponse)
def check_lighting(lat: float = Query(...), lng: float = Query(...)):
    nearest_lake = db.get_nearest_lake(lat, lng)
    if nearest_lake:
        return LightingCheckResponse(
            status="ok",
            classification=LightingClassification.NOT_EVALUATED,
            message=f"Not evaluated — {nearest_lake} is water and has no street-lighting baseline.",
        )

    # 1. Find nearest grid cells (3x3 window -> up to 9 nearest grids)
    grids = db.get_nearest_lighting_grids(lat, lng, limit=9)
    if not grids:
        return LightingCheckResponse(
            status="no_data",
            classification=LightingClassification.NOT_EVALUATED,
            message="No lighting data available for this region."
        )
        
    # Check if the closest one is natural
    closest = grids[0]
    if closest["land_use_class"] == "natural":
        return LightingCheckResponse(
            status="ok",
            classification=LightingClassification.NOT_EVALUATED,
            message="Not evaluated — natural area (e.g., park, water, mangroves)."
        )
        
    # 2. Gather readings for the 9 nearest grids and average them by date
    # We want a 90-day baseline
    date_to_radiance = {}
    date_to_seeded = {}
    
    for g in grids:
        readings = db.get_lighting_readings(g["grid_id"], days=90)
        for r in readings:
            if r["is_cloudy"]:
                continue
            d = r["date"]
            if d not in date_to_radiance:
                date_to_radiance[d] = []
                date_to_seeded[d] = []
            date_to_radiance[d].append(r["radiance"])
            date_to_seeded[d].append(r.get("is_seeded", False))
            
    if not date_to_radiance:
        return LightingCheckResponse(
            status="no_data",
            classification=LightingClassification.NOT_EVALUATED,
            message="No cloud-free lighting data available in the past 90 days."
        )
        
    # Average the grids per date
    avg_by_date = {d: sum(rads) / len(rads) for d, rads in date_to_radiance.items()}
    # A date is considered seeded if any of the grids for that date were seeded
    seeded_by_date = {d: any(seeds) for d, seeds in date_to_seeded.items()}
    
    sorted_dates = sorted(avg_by_date.keys(), reverse=True)
    
    latest_date = sorted_dates[0]
    latest_rad = avg_by_date[latest_date]
    
    # Generate history for the sparkline chart
    history = [
        {
            "date": d,
            "radiance": round(avg_by_date[d], 2),
            "is_seeded": seeded_by_date[d]
        }
        for d in sorted_dates
    ]
    
    # 3. Compute baseline (average of everything EXCEPT the latest few days)
    # Strategy: if we have >= 14 real readings in the baseline, use ONLY real readings.
    # Otherwise, use whatever we have (real + seeded) and set is_baseline_seeded = True.
    if len(sorted_dates) < 2:
        baseline_avg = latest_rad
        is_baseline_seeded = seeded_by_date[latest_date]
    else:
        baseline_dates = sorted_dates[1:]
        real_baseline_dates = [d for d in baseline_dates if not seeded_by_date[d]]
        
        if len(real_baseline_dates) >= 14:
            baseline_vals = [avg_by_date[d] for d in real_baseline_dates]
            is_baseline_seeded = False
        else:
            baseline_vals = [avg_by_date[d] for d in baseline_dates]
            is_baseline_seeded = any(seeded_by_date[d] for d in baseline_dates)
            
        baseline_avg = sum(baseline_vals) / len(baseline_vals)
        
    # 4. Classify
    is_chronic = False
    if len(sorted_dates) >= 3:
        recent_3 = [avg_by_date[d] for d in sorted_dates[:3]]
        if all(r < baseline_avg * 0.75 for r in recent_3):
            is_chronic = True
            
    is_dimmer = latest_rad < baseline_avg * 0.75
    
    if is_chronic:
        classification = LightingClassification.CHRONIC
    elif is_dimmer:
        classification = LightingClassification.DIMMER
    else:
        classification = LightingClassification.NORMAL
        
    return LightingCheckResponse(
        status="ok",
        classification=classification,
        date_used=latest_date,
        radiance_value=round(latest_rad, 2),
        baseline_average=round(baseline_avg, 2),
        is_baseline_seeded=is_baseline_seeded,
        history=history,
        message=f"Based on satellite pass: {latest_date} · ~500m resolution · compared to this area's 90-day average"
    )
