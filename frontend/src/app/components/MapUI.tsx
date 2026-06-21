"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Search, Navigation, X, LocateFixed, Shield, AlertTriangle, MapPin, Clock, ChevronUp, Users, Radio } from "lucide-react";
import axios from "axios";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });
const API = "http://localhost:8000/api/v1";

type Loc = { name: string; lat: number; lng: number };

const POPULAR: Loc[] = [
  { name: "India Gate, New Delhi", lat: 28.6129, lng: 77.2295 },
  { name: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
  { name: "Chandni Chowk, Old Delhi", lat: 28.6506, lng: 77.2334 },
  { name: "Sarojini Nagar Market", lat: 28.5745, lng: 77.1993 },
  { name: "Hauz Khas Village", lat: 28.5494, lng: 77.2001 },
  { name: "Karol Bagh", lat: 28.6514, lng: 77.1907 },
  { name: "Lajpat Nagar", lat: 28.5700, lng: 77.2400 },
  { name: "Dwarka Sector 21", lat: 28.5523, lng: 77.0586 },
  { name: "Rohini Sector 3", lat: 28.7158, lng: 77.1141 },
  { name: "Nehru Place", lat: 28.5491, lng: 77.2533 },
  { name: "Rajiv Chowk Metro", lat: 28.6328, lng: 77.2197 },
  { name: "Lodhi Garden", lat: 28.5931, lng: 77.2197 },
  { name: "Pitampura", lat: 28.7020, lng: 77.1316 },
  { name: "Vasant Kunj", lat: 28.5195, lng: 77.1570 },
  { name: "Greater Kailash", lat: 28.5401, lng: 77.2432 },
  { name: "Saket Mall", lat: 28.5244, lng: 77.2167 },
  { name: "Cyber City, Gurgaon", lat: 28.4595, lng: 77.0266 },
  { name: "Noida Sector 18", lat: 28.5706, lng: 77.3215 },
  { name: "Faridabad NIT", lat: 28.3949, lng: 77.3178 },
  { name: "Indirapuram, Ghaziabad", lat: 28.6469, lng: 77.3614 },
  { name: "Red Fort, Delhi", lat: 28.6562, lng: 77.2410 },
  { name: "Qutub Minar", lat: 28.5245, lng: 77.1855 },
  { name: "AIIMS Hospital", lat: 28.5672, lng: 77.2100 },
  { name: "JNU Campus", lat: 28.5402, lng: 77.1662 },
  { name: "Delhi University", lat: 28.6889, lng: 77.2099 },
  { name: "IGI Airport T3", lat: 28.5562, lng: 77.1000 },
  { name: "Kashmere Gate ISBT", lat: 28.6674, lng: 77.2289 },
  { name: "Anand Vihar ISBT", lat: 28.6469, lng: 77.3161 },
  { name: "New Delhi Railway Stn", lat: 28.6424, lng: 77.2197 },
  { name: "Janakpuri West", lat: 28.6233, lng: 77.0817 },
];

function searchLocal(q: string): Loc[] {
  if (!q || q.trim().length < 1) return [];
  const lower = q.toLowerCase();
  return POPULAR.filter(l => l.name.toLowerCase().includes(lower));
}

async function searchOnline(q: string): Promise<Loc[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const r = await axios.get(`${API}/search`, {
      params: { q },
    });
    return r.data.results || [];
  } catch {
    return [];
  }
}

function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MapUI() {
  const [view, setView] = useState<"map" | "search" | "risk" | "route">("map");
  const [heatmap, setHeatmap] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [loading, setLoading] = useState(false);
  const [totalPts, setTotalPts] = useState(0);

  // Search state
  const [activeField, setActiveField] = useState<"from" | "to">("to");
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromLoc, setFromLoc] = useState<Loc | null>(null);
  const [toLoc, setToLoc] = useState<Loc | null>(null);
  const [results, setResults] = useState<Loc[]>([]);
  const [searchTimer, setSearchTimer] = useState<any>(null);

  // Map state
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [destPos, setDestPos] = useState<[number, number] | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  // New Features State
  const [guardianMode, setGuardianMode] = useState(false);
  const [showPodAlert, setShowPodAlert] = useState(false);
  const [safeHavens, setSafeHavens] = useState<any[]>([]);

  useEffect(() => {
    axios.get(`${API}/geojson-heatmap`).then(r => {
      setHeatmap(r.data);
      setTotalPts(r.data?.features?.length || 0);
    }).catch(console.error);

    axios.get(`${API}/safe-havens`).then(r => {
      if (r.data && r.data.nodes) {
        setSafeHavens(r.data.nodes);
      }
    }).catch(console.error);
  }, []);

  // Unified search handler
  const doSearch = useCallback((q: string) => {
    const local = searchLocal(q);
    setResults(local);
    // Also search online after a delay
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(async () => {
      const online = await searchOnline(q);
      // Merge: local first, then online (deduped)
      const names = new Set(local.map(l => l.name));
      const merged = [...local, ...online.filter(o => !names.has(o.name))];
      setResults(merged.slice(0, 12));
    }, 400);
    setSearchTimer(timer);
  }, [searchTimer]);

  const handleFromChange = (val: string) => {
    setFromText(val);
    setFromLoc(null);
    setActiveField("from");
    doSearch(val);
  };

  const handleToChange = (val: string) => {
    setToText(val);
    setToLoc(null);
    setActiveField("to");
    doSearch(val);
  };

  const pickResult = (loc: Loc) => {
    if (activeField === "from") {
      setFromText(loc.name);
      setFromLoc(loc);
      setSelectedPos([loc.lat, loc.lng]);
      setFlyTo([loc.lat, loc.lng]);
      setResults([]);
      // Auto-focus destination
      if (!toLoc) {
        setActiveField("to");
        setResults(POPULAR.slice(0, 8));
      }
    } else {
      setToText(loc.name);
      setToLoc(loc);
      setDestPos([loc.lat, loc.lng]);
      setResults([]);
    }
  };

  // Auto-route when both are selected
  useEffect(() => {
    if (fromLoc && toLoc && view === "search") {
      executeRoute(fromLoc, toLoc);
    }
  }, [fromLoc, toLoc]);

  const executeRoute = (from: Loc, to: Loc) => {
    setLoading(true);
    setSelectedPos([from.lat, from.lng]);
    setDestPos([to.lat, to.lng]);
    axios.post(`${API}/optimize-route`, {
      origin: [from.lat, from.lng],
      destination: [to.lat, to.lng],
    }).then(r => {
      setRouteData(r.data);
      setView("route");
      setLoading(false);
      setFlyTo([(from.lat + to.lat) / 2, (from.lng + to.lng) / 2]);
      
      // Simulate finding a "Virtual Pod" match after 3 seconds
      setTimeout(() => setShowPodAlert(true), 3000);
    }).catch(e => { console.error(e); setLoading(false); });
  };

  const calcRisk = (lat: number, lng: number) => {
    setLoading(true);
    setSelectedPos([lat, lng]);
    setFlyTo([lat, lng]);
    axios.post(`${API}/calculate-risk`, { lat, lng, time_of_day: now() }).then(r => {
      setRisk(r.data);
      setView("risk");
      setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  };

  const handleMapClick = (lat: number, lng: number) => calcRisk(lat, lng);

  const openSearch = () => {
    setView("search");
    setActiveField("from");
    setResults(POPULAR.slice(0, 8));
  };

  const reset = () => {
    setView("map");
    setRisk(null);
    setRouteData(null);
    setSelectedPos(null);
    setDestPos(null);
    setFromText("");
    setToText("");
    setFromLoc(null);
    setToLoc(null);
    setResults([]);
    setGuardianMode(false);
    setShowPodAlert(false);
  };

  const riskGrad = (s: number) => s < 25 ? "from-green-400 to-emerald-500" : s < 60 ? "from-yellow-400 to-orange-500" : "from-red-500 to-rose-600";

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0 z-0">
        <MapComponent heatmapData={heatmap} routeData={routeData} selectedPosition={selectedPos} destinationPosition={destPos} flyToPosition={flyTo} onMapClick={handleMapClick} showHeatmap={showHeatmap} safeHavens={safeHavens} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700">Analyzing area...</span>
          </div>
        </div>
      )}

      {/* ════════ MAP VIEW (default) ════════ */}
      {view === "map" && (
        <>
          {/* Search Bar (collapsed) */}
          <div className="absolute top-10 left-4 right-4 z-10">
            <button onClick={openSearch} className="w-full bg-white rounded-2xl shadow-lg px-4 py-3.5 flex items-center gap-3 text-left hover:shadow-xl transition">
              <Search className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400 text-sm flex-1">Search any place in Delhi NCR...</span>
            </button>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowHeatmap(!showHeatmap)} className={`pill-btn flex items-center gap-1.5 ${showHeatmap ? "!bg-red-500 !text-white" : ""}`}>
                <AlertTriangle className="w-3.5 h-3.5" />{showHeatmap ? "Hide" : "Show"} Hotspots
              </button>
              <button onClick={openSearch} className="pill-btn flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" />Find Safe Route
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="absolute bottom-6 left-4 right-4 z-10 glass-panel rounded-2xl p-4">
            <p className="text-xl font-bold text-gray-800 uppercase tracking-wider mb-2" style={{ fontFamily: "var(--font-outfit)" }}>Abhaas <span className="text-xs text-gray-500 ml-1">— Live Crime Intel</span></p>
            <div className="flex justify-between">
              <div className="text-center"><p className="text-lg font-bold text-gray-800">{totalPts.toLocaleString()}</p><p className="text-[10px] text-gray-400">Datapoints</p></div>
              <div className="text-center"><p className="text-lg font-bold text-red-500">15</p><p className="text-[10px] text-gray-400">Zones</p></div>
              <div className="text-center"><p className="text-lg font-bold text-yellow-500">7</p><p className="text-[10px] text-gray-400">Crime Types</p></div>
              <div className="text-center"><p className="text-lg font-bold text-blue-500">{now()}</p><p className="text-[10px] text-gray-400">Live</p></div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">Tap anywhere on map to check risk score</p>
          </div>
        </>
      )}

      {/* ════════ SEARCH VIEW (Google Maps style) ════════ */}
      {view === "search" && (
        <div className="absolute inset-0 z-20 bg-white flex flex-col">
          {/* Top bar */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <button onClick={reset} className="p-2 rounded-full hover:bg-gray-100 transition shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
              <div className="flex-1 flex flex-col gap-2">
                {/* FROM */}
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                  <input
                    type="text"
                    placeholder="Choose starting point"
                    value={fromText}
                    onChange={e => handleFromChange(e.target.value)}
                    onFocus={() => { setActiveField("from"); doSearch(fromText || ""); }}
                    autoFocus
                    className="flex-1 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 transition"
                  />
                  {fromText && <button onClick={() => { setFromText(""); setFromLoc(null); }}><X className="w-4 h-4 text-gray-300" /></button>}
                </div>
                {/* TO */}
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                  <input
                    type="text"
                    placeholder="Choose destination"
                    value={toText}
                    onChange={e => handleToChange(e.target.value)}
                    onFocus={() => { setActiveField("to"); doSearch(toText || ""); }}
                    className="flex-1 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:bg-red-50 focus:ring-2 focus:ring-red-200 transition"
                  />
                  {toText && <button onClick={() => { setToText(""); setToLoc(null); }}><X className="w-4 h-4 text-gray-300" /></button>}
                </div>
              </div>
            </div>
            {/* Status chips */}
            <div className="flex gap-2 mt-3 ml-10">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${fromLoc ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                {fromLoc ? "✓ Start set" : "Pick start"}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${toLoc ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-400"}`}>
                {toLoc ? "✓ Dest set" : "Pick destination"}
              </span>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {results.length > 0 ? (
              results.map((loc, i) => (
                <button key={i} onClick={() => pickResult(loc)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 active:bg-blue-50 transition text-left border-b border-gray-50">
                  <div className={`p-2 rounded-full shrink-0 ${activeField === "from" ? "bg-blue-100" : "bg-red-100"}`}>
                    <MapPin className={`w-4 h-4 ${activeField === "from" ? "text-blue-600" : "text-red-600"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{loc.name}</p>
                    <p className="text-xs text-gray-400">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-gray-400 text-sm">
                <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                Type to search for any location
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ RISK VIEW ════════ */}
      {view === "risk" && risk && (
        <>
          {/* Collapsed search bar on top */}
          <div className="absolute top-10 left-4 right-4 z-10">
            <button onClick={openSearch} className="w-full bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 text-left">
              <Search className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400 text-sm flex-1">Search another location...</span>
            </button>
          </div>

          {/* Risk bottom sheet */}
          <div className="absolute bottom-0 left-0 right-0 z-10 glass-panel rounded-t-3xl p-5 shadow-2xl animate-slide-up">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {selectedPos ? `${selectedPos[0].toFixed(4)}, ${selectedPos[1].toFixed(4)}` : "Location"}
                </h2>
                <p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />Analyzed at {now()}</p>
              </div>
              <button onClick={reset} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X className="w-4 h-4" /></button>
            </div>

            <div className={`bg-gradient-to-r ${riskGrad(risk.risk_score)} rounded-2xl p-4 mb-3 text-white`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm opacity-80">Risk Score</p>
                  <p className="text-4xl font-black">{risk.risk_score}<span className="text-lg opacity-70">/100</span></p>
                </div>
                <div className="text-right">
                  <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full text-sm font-bold">{risk.safety_tier}</span>
                  <p className="text-sm mt-2 opacity-80">{risk.nearby_incident_count} incidents</p>
                </div>
              </div>
              <div className="mt-3 bg-white/20 rounded-full h-2 overflow-hidden">
                <div className="bg-white rounded-full h-2 transition-all duration-1000" style={{ width: `${risk.risk_score}%` }} />
              </div>
            </div>

            {risk.crime_breakdown && Object.keys(risk.crime_breakdown).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.entries(risk.crime_breakdown).map(([c, n]: any) => (
                  <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{c}: {n}</span>
                ))}
              </div>
            )}

            <button onClick={() => { setFromText(`${selectedPos![0].toFixed(4)}, ${selectedPos![1].toFixed(4)}`); setFromLoc({ name: "Current", lat: selectedPos![0], lng: selectedPos![1] }); openSearch(); setActiveField("to"); setResults(POPULAR.slice(0, 8)); }} className="w-full bg-blue-500 text-white font-semibold py-3.5 rounded-xl shadow-md hover:bg-blue-600 transition flex items-center justify-center gap-2">
              <Navigation className="w-5 h-5" />Navigate From Here
            </button>
          </div>
        </>
      )}

      {/* ════════ ROUTE VIEW ════════ */}
      {view === "route" && routeData && (
        <>
          <div className="absolute top-10 left-4 right-4 z-10 glass-panel rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
                <div className="w-0.5 h-8 bg-gray-300" />
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium truncate">{fromLoc?.name || "Origin"}</div>
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium flex justify-between items-center">
                  <span className="truncate">{toLoc?.name || "Destination"}</span>
                  <X className="w-4 h-4 cursor-pointer text-gray-400 shrink-0" onClick={reset} />
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-3">
              <div className="flex justify-between items-center px-2 py-1 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-1 bg-blue-500 rounded-full" />
                  <p className="text-xs font-bold text-blue-700 uppercase">Safest Path</p>
                </div>
                <p className="text-sm font-bold text-gray-800">{routeData.safe_distance_km ?? "—"} km • {routeData.safe_duration_min ?? "—"} min</p>
              </div>
              
              <div className="flex justify-between items-center px-2 py-1 bg-red-50 rounded-lg border border-red-100">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-1 bg-red-400 border-b-2 border-dashed border-red-100 rounded-full" />
                  <p className="text-xs font-bold text-red-700 uppercase">Fastest Path</p>
                </div>
                <p className="text-sm font-bold text-gray-800">{routeData.fast_distance_km ?? "—"} km • {routeData.fast_duration_min ?? "—"} min</p>
              </div>
            </div>

            {/* Virtual Pod Alert */}
            {showPodAlert && (
              <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 rounded-xl animate-slide-up shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-100 p-2 rounded-full"><Users className="w-4 h-4 text-purple-600" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-purple-900">Virtual Pod Match!</p>
                    <p className="text-xs text-purple-700 mt-0.5">Another verified user is walking your route 30s ahead. Adjust pace to walk together?</p>
                    <div className="flex gap-2 mt-2">
                      <button className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium shadow-sm hover:bg-purple-700">Join Pod</button>
                      <button onClick={() => setShowPodAlert(false)} className="text-xs bg-white text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-50">Dismiss</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
          <div className="absolute bottom-6 left-4 right-4 z-10 flex gap-2">
            <button onClick={reset} className="flex-1 bg-white text-gray-700 font-semibold py-3 rounded-xl shadow-lg hover:bg-gray-50 transition">← Back</button>
            <button 
              onClick={() => setGuardianMode(!guardianMode)} 
              className={`flex-[2] text-white font-semibold py-3 rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${guardianMode ? "bg-red-500 animate-pulse" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {guardianMode ? <Radio className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
              {guardianMode ? "Live Witnessing Active" : "Activate Guardian"}
            </button>
          </div>
        </>
      )}

      {/* Guardian Mode Overlay indicator */}
      {guardianMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-bounce">
          <div className="w-2 h-2 bg-white rounded-full animate-ping" /> Sharing Live GPS & Audio
        </div>
      )}

      {/* Locate button */}
      {(view === "map" || view === "risk") && (
        <button onClick={() => calcRisk(28.6129, 77.2295)} className="absolute right-4 bottom-24 bg-white p-3 rounded-full shadow-lg z-10 text-blue-500 hover:bg-blue-50 transition">
          <LocateFixed className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
