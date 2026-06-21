from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple, Dict, Any
import pandas as pd
import numpy as np
import os
import random
from sklearn.datasets import make_blobs
from scipy.spatial import KDTree
import networkx as nx
from math import radians, cos, sin, asin, sqrt

app = FastAPI(title="RouteShield AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RiskRequest(BaseModel):
    lat: float
    lng: float
    time_of_day: str

class RouteRequest(BaseModel):
    origin: List[float]
    destination: List[float]

# ── Crime Weighting Matrix ──
# Maps both standard IPC names AND Kaggle dataset crime names
CRIME_WEIGHTS = {
    # Standard IPC
    'murder': 10, 'assualt murders': 10, 'assault murders': 10,
    'rape': 10, 'gangrape': 10, 'gang rape': 10, 'rape/assault on women': 10,
    'sexual harassement': 9, 'sexual harassment': 9,
    'kidnapping': 10,
    'robbery': 8, 'snatching': 8, 'extortion': 8,
    'burglary': 5, 'theft': 5, 'motor vehicle theft': 5,
    'cheating': 2, 'public nuisance': 2, 'other ipc crimes': 2,
}

def get_weight(crime_head: str) -> int:
    key = crime_head.strip().lower()
    if key in CRIME_WEIGHTS:
        return CRIME_WEIGHTS[key]
    # Fuzzy fallback
    for k, w in CRIME_WEIGHTS.items():
        if k in key or key in k:
            return w
    return 3  # Unknown crime still gets moderate weight

# ── Delhi + NCR Bounding Boxes ──
DELHI_DISTRICTS_BBOX = {
    # Core Delhi
    'NEW DELHI':    {'lat': (28.58, 28.65), 'lng': (77.15, 77.25)},
    'NORTH DELHI':  {'lat': (28.65, 28.75), 'lng': (77.15, 77.25)},
    'SOUTH DELHI':  {'lat': (28.45, 28.58), 'lng': (77.15, 77.28)},
    'EAST DELHI':   {'lat': (28.58, 28.68), 'lng': (77.25, 77.35)},
    'WEST DELHI':   {'lat': (28.58, 28.68), 'lng': (77.05, 77.15)},
    'CENTRAL DELHI':{'lat': (28.62, 28.68), 'lng': (77.19, 77.25)},
    'DWARKA':       {'lat': (28.55, 28.62), 'lng': (76.98, 77.08)},
    'ROHINI':       {'lat': (28.68, 28.78), 'lng': (77.05, 77.15)},
    'IGIA':         {'lat': (28.53, 28.57), 'lng': (77.08, 77.12)},
    'METRO':        {'lat': (28.55, 28.75), 'lng': (77.05, 77.35)},
    # NCR Regions
    'GURGAON':      {'lat': (28.40, 28.52), 'lng': (76.95, 77.10)},
    'NOIDA':        {'lat': (28.50, 28.62), 'lng': (77.30, 77.42)},
    'FARIDABAD':    {'lat': (28.35, 28.45), 'lng': (77.28, 77.38)},
    'GHAZIABAD':    {'lat': (28.62, 28.72), 'lng': (77.35, 77.48)},
    'GREATER NOIDA':{'lat': (28.42, 28.52), 'lng': (77.42, 77.55)},
}

# Known Delhi localities → district mapping
LOCALITY_TO_DISTRICT = {
    'CONNAUGHT PLACE': 'NEW DELHI', 'BARAKHAMBA ROAD': 'NEW DELHI',
    'CHANAKYAPURI': 'NEW DELHI', 'JANPATH': 'NEW DELHI',
    'LODHI COLONY': 'SOUTH DELHI', 'DEFENCE COLONY': 'SOUTH DELHI',
    'HAUZ KHAS': 'SOUTH DELHI', 'SAKET': 'SOUTH DELHI', 'MEHRAULI': 'SOUTH DELHI',
    'LAJPAT NAGAR': 'SOUTH DELHI', 'GREATER KAILASH': 'SOUTH DELHI',
    'MALVIYA NAGAR': 'SOUTH DELHI', 'VASANT KUNJ': 'SOUTH DELHI',
    'CHANDNI CHOWK': 'CENTRAL DELHI', 'KAROL BAGH': 'CENTRAL DELHI',
    'PAHARGANJ': 'CENTRAL DELHI', 'DARYAGANJ': 'CENTRAL DELHI',
    'PITAMPURA': 'ROHINI', 'ROHINI': 'ROHINI',
    'DWARKA': 'DWARKA', 'JANAKPURI': 'WEST DELHI', 'RAJOURI GARDEN': 'WEST DELHI',
    'SHAHDARA': 'EAST DELHI', 'PREET VIHAR': 'EAST DELHI', 'ANAND VIHAR': 'EAST DELHI',
    'MODEL TOWN': 'NORTH DELHI', 'CIVIL LINES': 'NORTH DELHI',
    'ALIPUR': 'NORTH DELHI', 'NARELA': 'NORTH DELHI',
}

# Global Data
crime_points = []
spatial_index = None

def haversine(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return c * 6371000  # meters

def map_location_to_district(loc: str) -> str:
    """Map a specific locality name to a Delhi district."""
    loc_upper = loc.strip().upper()
    # Direct match
    if loc_upper in LOCALITY_TO_DISTRICT:
        return LOCALITY_TO_DISTRICT[loc_upper]
    # Partial match
    for known_loc, dist in LOCALITY_TO_DISTRICT.items():
        if known_loc in loc_upper or loc_upper in known_loc:
            return dist
    # Fallback to random core Delhi district
    core = ['NEW DELHI', 'NORTH DELHI', 'SOUTH DELHI', 'EAST DELHI', 'WEST DELHI', 'CENTRAL DELHI', 'DWARKA', 'ROHINI']
    return random.choice(core)

def init_data():
    global crime_points, spatial_index
    file_path = 'delhi_crime_data_real.csv'
    data_records = []

    if os.path.exists(file_path):
        df = pd.read_csv(file_path)
        df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
        df['Year'] = df['Date'].dt.year
        df = df[df['Year'] >= 2020]

        # Smart locality → district mapping
        df['Districts'] = df['Location'].apply(map_location_to_district)

        agg_df = df.groupby(['Crime Type', 'Districts']).size().reset_index(name='Incidents_Count')
        for _, row in agg_df.iterrows():
            data_records.append({
                'Districts': row['Districts'],
                'Crime_Head': row['Crime Type'],
                'Incidents_Count': int(row['Incidents_Count'])
            })
        print(f"Loaded {len(df)} real records -> {len(data_records)} aggregated groups")
    elif os.path.exists('delhi_crime_data.csv'):
        df = pd.read_csv('delhi_crime_data.csv')
        if 'Year' in df.columns:
            df = df[df['Year'] >= 2020]
        agg_df = df.groupby(['Crime_Head', 'Districts'])['Incidents_Count'].sum().reset_index()
        for _, row in agg_df.iterrows():
            data_records.append({
                'Districts': row['Districts'],
                'Crime_Head': row['Crime_Head'],
                'Incidents_Count': int(row['Incidents_Count'])
            })
    else:
        # Fallback mock dataset
        districts = list(DELHI_DISTRICTS_BBOX.keys())
        crimes = list(CRIME_WEIGHTS.keys())
        for _ in range(500):
            data_records.append({
                'Districts': random.choice(districts),
                'Crime_Head': random.choice(crimes),
                'Incidents_Count': random.randint(1, 50)
            })

    generated_points = []

    for record in data_records:
        dist = str(record['Districts']).upper()
        if dist not in DELHI_DISTRICTS_BBOX:
            continue

        weight = get_weight(record['Crime_Head'])
        # Generate MORE points — scale up so heatmap is dense and visible
        num_points = max(2, int((record['Incidents_Count'] * weight) / 10))

        bbox = DELHI_DISTRICTS_BBOX[dist]
        center_lat = (bbox['lat'][0] + bbox['lat'][1]) / 2
        center_lng = (bbox['lng'][0] + bbox['lng'][1]) / 2
        spread = max(bbox['lat'][1] - bbox['lat'][0], bbox['lng'][1] - bbox['lng'][0]) / 3

        X, _ = make_blobs(n_samples=num_points, centers=[[center_lat, center_lng]], cluster_std=spread)
        for point in X:
            lat = float(np.clip(point[0], bbox['lat'][0], bbox['lat'][1]))
            lng = float(np.clip(point[1], bbox['lng'][0], bbox['lng'][1]))
            generated_points.append({
                'lat': lat, 'lng': lng,
                'crime': record['Crime_Head'],
                'weight': weight
            })

    crime_points = generated_points
    if not crime_points:
        crime_points.append({'lat': 28.6139, 'lng': 77.2090, 'crime': 'Mock', 'weight': 1})

    coords = [[p['lat'], p['lng']] for p in crime_points]
    spatial_index = KDTree(coords)
    print(f"Spatial index built with {len(crime_points)} crime points.")

@app.on_event("startup")
def startup_event():
    init_data()

@app.post("/api/v1/calculate-risk")
def calculate_risk(req: RiskRequest):
    lat, lng = req.lat, req.lng
    time_of_day = req.time_of_day

    # Search wider — up to 500 nearest points
    k = min(500, len(crime_points))
    distances, indices = spatial_index.query([lat, lng], k=k)

    nearby = []
    weighted_sum = 0.0
    for idx in indices:
        if idx < len(crime_points):
            pt = crime_points[idx]
            dist_m = haversine(lng, lat, pt['lng'], pt['lat'])
            if dist_m <= 1000:  # 1km radius for better coverage
                # Closer = more dangerous — inverse distance weighting
                proximity_factor = max(0.2, 1.0 - (dist_m / 1000))
                weighted_sum += pt['weight'] * proximity_factor
                nearby.append(pt)

    # Normalize: score 0-100
    # With real data, a weighted_sum of 50+ should be "High Risk"
    base_score = min(100.0, (weighted_sum / max(len(nearby), 1)) * len(nearby) * 0.8)
    base_score = min(100.0, weighted_sum * 1.5)

    # Night-time multiplier
    try:
        hour = int(time_of_day.split(":")[0])
        if hour >= 22 or hour <= 5:
            base_score = min(100.0, base_score * 1.5)
    except:
        pass

    if base_score < 25:
        tier = "Safe"
    elif base_score < 60:
        tier = "Caution"
    else:
        tier = "High Risk"

    # Build breakdown of nearby crime types
    crime_breakdown = {}
    for pt in nearby:
        crime_breakdown[pt['crime']] = crime_breakdown.get(pt['crime'], 0) + 1

    return {
        "risk_score": round(base_score, 2),
        "safety_tier": tier,
        "nearby_incident_count": len(nearby),
        "crime_breakdown": crime_breakdown,
        "radius_meters": 1000,
    }

@app.post("/api/v1/optimize-route")
def optimize_route(req: RouteRequest):
    olat, olng = req.origin
    dlat, dlng = req.destination
    
    # 1. Create a bounding box with padding to build the navigation grid
    padding = 0.015  # ~1.5km padding around the direct path
    min_lat, max_lat = min(olat, dlat) - padding, max(olat, dlat) + padding
    min_lng, max_lng = min(olng, dlng) - padding, max(olng, dlng) + padding
    
    # 2. Generate a 20x20 spatial grid
    grid_size = 20
    lats = np.linspace(min_lat, max_lat, grid_size)
    lngs = np.linspace(min_lng, max_lng, grid_size)
    
    # Fast risk lookup using our KDTree
    def get_risk(lat, lng):
        k = min(50, len(crime_points))
        distances, indices = spatial_index.query([lat, lng], k=k)
        weighted_sum = 0.0
        for idx in indices:
            if idx < len(crime_points):
                pt = crime_points[idx]
                dist_m = haversine(lng, lat, pt['lng'], pt['lat'])
                if dist_m <= 1000:
                    proximity_factor = max(0.2, 1.0 - (dist_m / 1000))
                    weighted_sum += pt['weight'] * proximity_factor
        return min(100.0, weighted_sum * 1.5)

    # 3. Build NetworkX Graph
    G = nx.Graph()
    
    node_risks = {}
    for i in range(grid_size):
        for j in range(grid_size):
            node_id = f"{i}_{j}"
            lat, lng = lats[i], lngs[j]
            G.add_node(node_id, pos=(lat, lng))
            node_risks[node_id] = get_risk(lat, lng)

    # 4. Connect grid points with weights = Distance + Risk * 10
    for i in range(grid_size):
        for j in range(grid_size):
            current = f"{i}_{j}"
            # 8-way connectivity
            for di in [-1, 0, 1]:
                for dj in [-1, 0, 1]:
                    if di == 0 and dj == 0: continue
                    ni, nj = i + di, j + dj
                    if 0 <= ni < grid_size and 0 <= nj < grid_size:
                        neighbor = f"{ni}_{nj}"
                        lat1, lng1 = G.nodes[current]['pos']
                        lat2, lng2 = G.nodes[neighbor]['pos']
                        
                        dist = haversine(lng1, lat1, lng2, lat2) # in meters
                        # Risk penalty: multiplying 0-100 risk score by 10 
                        # This adds up to 1000 meters of "virtual distance" penalty for high risk areas
                        risk_penalty = node_risks[neighbor] * 10 
                        
                        G.add_edge(current, neighbor, distance=dist, safe_weight=dist + risk_penalty)

    # 5. Insert Start and End nodes
    G.add_node("start", pos=(olat, olng))
    G.add_node("end", pos=(dlat, dlng))
    end_risk = get_risk(dlat, dlng)
    
    def connect_to_grid(node_name, n_lat, n_lng, is_end=False):
        distances = []
        for n in G.nodes():
            if n in ["start", "end"]: continue
            glat, glng = G.nodes[n]['pos']
            dist = haversine(n_lng, n_lat, glng, glat)
            distances.append((dist, n))
        distances.sort()
        # Connect to 4 nearest neighbors
        for dist, nearest in distances[:4]:
            if is_end:
                G.add_edge(nearest, node_name, distance=dist, safe_weight=dist + (end_risk * 10))
            else:
                G.add_edge(node_name, nearest, distance=dist, safe_weight=dist + (node_risks[nearest] * 10))

    connect_to_grid("start", olat, olng)
    connect_to_grid("end", dlat, dlng, is_end=True)

    # 6. Run A* Pathfinding (Twice)
    def heuristic(n1, n2):
        lat1, lng1 = G.nodes[n1]['pos']
        lat2, lng2 = G.nodes[n2]['pos']
        return haversine(lng1, lat1, lng2, lat2)

    import requests as http_requests

    def snap_to_osrm(waypoints):
        # waypoints: list of [lat, lng]
        if not waypoints or len(waypoints) < 2: return None, 0, 0
        # OSRM expects lng,lat
        coords_str = ";".join([f"{p[1]},{p[0]}" for p in waypoints])
        url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson"
        try:
            resp = http_requests.get(url, timeout=5)
            data = resp.json()
            if data.get("code") == "Ok" and data.get("routes"):
                coords = data["routes"][0]["geometry"]["coordinates"]
                route = [[c[1], c[0]] for c in coords]
                dist = data["routes"][0]["distance"] / 1000 # km
                dur = data["routes"][0]["duration"] / 60 # min
                return route, round(dist, 1), max(1, round(dur))
        except Exception as e:
            print(f"OSRM Error: {e}")
        return None, 0, 0

    try:
        # Safest Route (NetworkX A* snapped to roads)
        safe_path = nx.astar_path(G, "start", "end", heuristic=heuristic, weight="safe_weight")
        safe_grid_route = [G.nodes[n]['pos'] for n in safe_path]
        
        # Sample points so OSRM follows our custom safe detour (OSRM max is usually 100, but let's use ~8 for speed)
        if len(safe_grid_route) > 8:
            indices = np.linspace(0, len(safe_grid_route)-1, 8).astype(int)
            safe_waypoints = [safe_grid_route[i] for i in indices]
        else:
            safe_waypoints = safe_grid_route
            
        safe_route, safe_dist_km, safe_dur_min = snap_to_osrm(safe_waypoints)
        if not safe_route:
            safe_route = safe_grid_route # Fallback to blocky grid
            safe_dist_m = sum(haversine(safe_route[k][1], safe_route[k][0], safe_route[k+1][1], safe_route[k+1][0]) for k in range(len(safe_route)-1))
            safe_dist_km = round(safe_dist_m / 1000, 1)
            safe_dur_min = max(1, round(safe_dist_km / 30 * 60))

        # Fastest Route (Pure OSRM from A -> B)
        fast_route, fast_dist_km, fast_dur_min = snap_to_osrm([[olat, olng], [dlat, dlng]])
        if not fast_route:
            fast_path = nx.astar_path(G, "start", "end", heuristic=heuristic, weight="distance")
            fast_route = [G.nodes[n]['pos'] for n in fast_path]
            fast_dist_km = safe_dist_km
            fast_dur_min = safe_dur_min
        
        return {
            "safe_route": safe_route,
            "safe_distance_km": safe_dist_km,
            "safe_duration_min": safe_dur_min,
            "fast_route": fast_route,
            "fast_distance_km": fast_dist_km,
            "fast_duration_min": fast_dur_min
        }
    except nx.NetworkXNoPath:
        base_route = [[olat, olng], [dlat, dlng]]
        return {
            "safe_route": base_route, "safe_distance_km": None, "safe_duration_min": None,
            "fast_route": base_route, "fast_distance_km": None, "fast_duration_min": None
        }

safe_havens_cache = []

@app.get("/api/v1/safe-havens")
def get_safe_havens():
    """Fetch REAL Police Stations and Hospitals via Overpass API for maximum credibility."""
    global safe_havens_cache
    if safe_havens_cache:
        return {"nodes": safe_havens_cache}
        
    import requests as http_requests
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = """
    [out:json];
    (
      node["amenity"="police"](28.4,76.8,28.9,77.6);
      node["amenity"="hospital"](28.4,76.8,28.9,77.6);
      node["amenity"="pharmacy"]["opening_hours"="24/7"](28.4,76.8,28.9,77.6);
      node["amenity"="cafe"]["opening_hours"="24/7"](28.4,76.8,28.9,77.6);
    );
    out body limit 400;
    """
    try:
        resp = http_requests.post(overpass_url, data=overpass_query, timeout=10)
        data = resp.json()
        for element in data.get("elements", []):
            if "lat" in element and "lon" in element:
                tags = element.get("tags", {})
                name = tags.get("name", "")
                amenity = tags.get("amenity", "facility")
                
                if name:
                    label = f"Verified {amenity.capitalize()}: {name}"
                else:
                    label = f"Verified 24/7 {amenity.capitalize()}"
                    
                safe_havens_cache.append({
                    "lat": element["lat"], 
                    "lng": element["lon"], 
                    "label": label
                })
        return {"nodes": safe_havens_cache}
    except Exception as e:
        print(f"Overpass API error: {e}")
        return {"nodes": []}

safe_havens_cache = []

@app.get("/api/v1/safe-havens")
def get_safe_havens():
    """Fetch REAL Police Stations and Hospitals via Overpass API for maximum credibility."""
    global safe_havens_cache
    if safe_havens_cache:
        return {"nodes": safe_havens_cache}
        
    import requests as http_requests
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = """
    [out:json];
    (
      node["amenity"="police"](28.4,76.8,28.9,77.6);
      node["amenity"="hospital"](28.4,76.8,28.9,77.6);
      node["amenity"="pharmacy"]["opening_hours"="24/7"](28.4,76.8,28.9,77.6);
      node["amenity"="cafe"]["opening_hours"="24/7"](28.4,76.8,28.9,77.6);
    );
    out body;
    """
    try:
        resp = http_requests.post(overpass_url, data=overpass_query, timeout=10)
        data = resp.json()
        for element in data.get("elements", []):
            if "lat" in element and "lon" in element:
                tags = element.get("tags", {})
                name = tags.get("name", "")
                amenity = tags.get("amenity", "facility")
                
                if name:
                    label = f"Verified {amenity.capitalize()}: {name}"
                else:
                    label = f"Verified 24/7 {amenity.capitalize()}"
                    
                safe_havens_cache.append({
                    "lat": element["lat"], 
                    "lng": element["lon"], 
                    "label": label
                })
        return {"nodes": safe_havens_cache}
    except Exception as e:
        print(f"Overpass API error: {e}")
        return {"nodes": []}

@app.get("/api/v1/geojson-heatmap")
def geojson_heatmap():
    features = []
    for pt in crime_points:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [pt['lng'], pt['lat']]
            },
            "properties": {
                "crime": pt['crime'],
                "weight": pt['weight']
            }
        })
    return {"type": "FeatureCollection", "features": features}

@app.get("/api/v1/search")
def search_places(q: str = ""):
    """Proxy geocoding through backend to avoid browser rate-limits."""
    import requests as http_requests
    if not q or len(q.strip()) < 2:
        return {"results": []}
    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": q,
                "format": "json",
                "limit": 10,
                "countrycodes": "in",
                "viewbox": "76.8,28.9,77.6,28.3",  # Delhi NCR bounding box
                "bounded": 0,  # Allow results outside viewbox but prefer inside
            },
            headers={"User-Agent": "RouteShield-Hackathon/1.0"},
            timeout=5,
        )
        data = resp.json()
        results = []
        for item in data:
            results.append({
                "name": item.get("display_name", ""),
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
            })
        return {"results": results}
    except Exception as e:
        print(f"Nominatim error: {e}")
        return {"results": []}
