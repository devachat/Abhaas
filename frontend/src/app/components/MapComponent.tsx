"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet marker icon issue
const blueIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const redIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const greenIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Component to render heatmap dots from GeoJSON
function HeatmapLayer({ data }: { data: any }) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!data || !data.features) return;

    // Remove old layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const layer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        const weight = feature.properties?.weight || 1;
        const color = weight >= 10 ? '#ef4444' : weight >= 8 ? '#f97316' : weight >= 5 ? '#eab308' : '#3b82f6';
        const radius = weight >= 10 ? 10 : weight >= 8 ? 8 : weight >= 5 ? 6 : 4;
        return L.circleMarker(latlng, {
          radius: radius,
          fillColor: color,
          color: color,
          weight: 1,
          opacity: 0.4,
          fillOpacity: 0.25,
        });
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          layer.bindPopup(
            `<div style="font-family:Inter,sans-serif;font-size:13px">
              <b style="color:#1e293b">${feature.properties.crime}</b><br/>
              <span style="color:#64748b">Severity: ${feature.properties.weight}/10</span>
            </div>`
          );
        }
      }
    }).addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [data, map]);

  return null;
}

// Component to handle map clicks
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to fly to a location
function FlyToLocation({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 14, { duration: 1.2 });
    }
  }, [position, map]);
  return null;
}

interface MapComponentProps {
  heatmapData: any;
  routeData: any;
  selectedPosition: [number, number] | null;
  destinationPosition: [number, number] | null;
  flyToPosition: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
  showHeatmap: boolean;
  safeHavens?: any[];
}

export default function MapComponent({ 
  heatmapData, 
  routeData, 
  selectedPosition, 
  destinationPosition, 
  flyToPosition,
  onMapClick, 
  showHeatmap,
  safeHavens = []
}: MapComponentProps) {
  const center: [number, number] = [28.6139, 77.2090];

  // Default hardcoded network for fallback if API is slow
  const defaultHavens = [
    { lat: 28.6139, lng: 77.2090, label: "24/7 Safe Haven (Cafe)" },
    { lat: 28.6315, lng: 77.2167, label: "24/7 Safe Haven (Hotel Lobby)" },
    { lat: 28.5745, lng: 77.1993, label: "24/7 Police Assistance Kiosk" },
    { lat: 28.5491, lng: 77.2533, label: "24/7 Safe Haven (Store)" },
    { lat: 28.4595, lng: 77.0266, label: "Corporate Security Hub (Gurgaon)" },
    { lat: 28.5706, lng: 77.3215, label: "24/7 Safe Haven (Noida Sector 18)" },
    { lat: 28.7041, lng: 77.1025, label: "Verified 24/7 Pharmacy (Rohini)" },
    { lat: 28.6505, lng: 77.2303, label: "Safe Haven (Chandni Chowk)" },
    { lat: 28.5562, lng: 77.1000, label: "Airport Security Zone (T3)" },
    { lat: 28.5244, lng: 77.2167, label: "Mall Security Hub (Saket)" },
    { lat: 28.5931, lng: 77.2197, label: "Park Guardian Post (Lodhi)" },
    { lat: 28.6233, lng: 77.0817, label: "24/7 Metro Kiosk (Janakpuri)" },
    { lat: 28.6889, lng: 77.2099, label: "Campus Guardian (DU North)" },
    { lat: 28.5402, lng: 77.1662, label: "Campus Guardian (JNU)" },
    { lat: 28.5672, lng: 77.2100, label: "Hospital Safe Zone (AIIMS)" },
    { lat: 28.5195, lng: 77.1570, label: "24/7 Safe Haven (Vasant Kunj)" },
    { lat: 28.6469, lng: 77.3161, label: "ISBT Security Node (Anand Vihar)" },
    { lat: 28.3949, lng: 77.3178, label: "Police Kiosk (Faridabad)" },
    { lat: 28.6469, lng: 77.3614, label: "Safe Haven (Indirapuram)" },
    { lat: 28.6129, lng: 77.2295, label: "Police Kiosk (India Gate)" },
    { lat: 28.5401, lng: 77.2432, label: "Verified Pharmacy (GK)" },
    { lat: 28.6424, lng: 77.2197, label: "Railway Police Node (NDLS)" }
  ];

  const nodesToRender = safeHavens.length > 0 ? safeHavens : defaultHavens;

  return (
    <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} zoomControl={false}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      <MapClickHandler onMapClick={onMapClick} />
      <FlyToLocation position={flyToPosition} />

      {showHeatmap && heatmapData && <HeatmapLayer data={heatmapData} />}

      {/* Guardian Nodes (Safe Havens) - Dynamically fetched or Default */}
      {nodesToRender.map((node, i) => (
        <Marker key={i} position={[node.lat, node.lng]} icon={greenIcon}>
          <Popup>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: "bold", color: "#16a34a" }}>
              🛡️ Guardian Node<br/><span style={{fontWeight: "normal", color: "#666"}}>{node.label}</span>
            </span>
          </Popup>
        </Marker>
      ))}

      {selectedPosition && (
        <Marker position={selectedPosition} icon={blueIcon}>
          <Popup>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}>
              📍 Selected Location<br />
              {selectedPosition[0].toFixed(4)}, {selectedPosition[1].toFixed(4)}
            </span>
          </Popup>
        </Marker>
      )}

      {destinationPosition && (
        <Marker position={destinationPosition} icon={redIcon}>
          <Popup>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}>
              🏁 Destination<br />
              {destinationPosition[0].toFixed(4)}, {destinationPosition[1].toFixed(4)}
            </span>
          </Popup>
        </Marker>
      )}

      {routeData && routeData.fast_route && (
        <Polyline
          positions={routeData.fast_route}
          pathOptions={{ color: '#ef4444', weight: 4, dashArray: '10, 10', opacity: 0.6 }}
        />
      )}

      {routeData && routeData.safe_route && (
        <Polyline
          positions={routeData.safe_route}
          pathOptions={{ color: '#3b82f6', weight: 6, opacity: 0.9 }}
        />
      )}
    </MapContainer>
  );
}
