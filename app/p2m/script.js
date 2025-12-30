// ==========================
// CONFIG (NO PROXY)
// ==========================
// Public OSRM demo server (no key). Great for MVP.
// If it rate-limits, you can self-host OSRM later.
const OSRM_BASE = "https://router.project-osrm.org";

// ==========================
// National + NSW Hybrid Basemaps
// ==========================
const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
});
const nswTopo = L.tileLayer('https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Base_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; NSW Spatial Services', maxZoom: 18
});
const nswImagery = L.tileLayer('https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; NSW Spatial Services', maxZoom: 18
});
const nswTransport = L.tileLayer('https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Transport/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; NSW Spatial Services', maxZoom: 18
});

const map = L.map('map', { center: [-25.0, 134.0], zoom: 5, zoomControl: true, layers: [osmLayer] });

const baseMaps = {
  "🌏 Australia (OSM)": osmLayer,
  "🗺️ NSW Topographic": nswTopo,
  "🛰️ NSW Imagery": nswImagery,
  "🚗 NSW Transport": nswTransport
};
L.control.layers(baseMaps, null, { position: 'topright', collapsed: false }).addTo(map);

const nswBounds = { north: -28.15, south: -37.6, east: 153.65, west: 140.95 };
function isInNSW(latlng) {
  return latlng.lat < nswBounds.north && latlng.lat > nswBounds.south && latlng.lng < nswBounds.east && latlng.lng > nswBounds.west;
}

let currentBaseLayer = osmLayer;
map.on("baselayerchange", (e) => currentBaseLayer = e.layer);

let lastInNSW = isInNSW(map.getCenter());
map.on('moveend', () => {
  const inNSW = isInNSW(map.getCenter());

  if (inNSW && !lastInNSW && currentBaseLayer === osmLayer) {
    map.removeLayer(osmLayer);
    map.addLayer(nswTopo);
    currentBaseLayer = nswTopo;
  }

  if (!inNSW && lastInNSW && [nswTopo, nswImagery, nswTransport].includes(currentBaseLayer)) {
    map.eachLayer(l => { if ([nswTopo, nswImagery, nswTransport].includes(l)) map.removeLayer(l); });
    map.addLayer(osmLayer);
    currentBaseLayer = osmLayer;
  }

  lastInNSW = inNSW;
});

// ==========================
// UI Globals
// ==========================
const addBtn = document.getElementById("addLocationBtn");
const findBtn = document.getElementById("findBtn");
const locationsDiv = document.getElementById("locations");
const drivingModeToggle = document.getElementById("drivingMode");
const statusBar = document.getElementById("statusBar");
const routeSummary = document.getElementById("routeSummary");
const showRoutesBtn = document.getElementById("showRoutesBtn");
const showAltBtn = document.getElementById("showAltBtn");

let midpointMarker = null;
let poiMarkers = [];
let startMarkers = [];
let routeLayers = []; // { idx, layer, color }
let dimOthers = false;
let selectedIdx = null;

const colors = ["#ff0000", "#00ff00", "#00b4ff", "#ffa500", "#ff00ff", "#a855f7", "#22c55e", "#f97316"];

// ==========================
// UI helpers
// ==========================
function showLoading(msg="Loading...", sub="") {
  document.getElementById("loadingText").textContent = msg;
  document.getElementById("loadingSubText").textContent = sub;
  document.getElementById("loading").classList.add("active");
}
function hideLoading() { document.getElementById("loading").classList.remove("active"); }
function setStatus(msg) { statusBar.textContent = msg; }

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearRunLayers() {
  [midpointMarker, ...poiMarkers, ...startMarkers].forEach(l => l && map.removeLayer(l));
  midpointMarker = null;
  poiMarkers = [];
  startMarkers = [];

  routeLayers.forEach(r => r.layer && map.removeLayer(r.layer));
  routeLayers = [];

  routeSummary.innerHTML = "";
  selectedIdx = null;
}

function metersToNice(m){
  if (!m) return "—";
  return m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function secondsToNice(sec){
  if (!sec && sec !== 0) return "—";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600);
  const m = Math.round((sec%3600)/60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ==========================
// Segmented buttons
// ==========================
showRoutesBtn.addEventListener("click", () => {
  showRoutesBtn.classList.add("active");
  showAltBtn.classList.remove("active");
  // nothing to toggle here; routes always visible when computed
});
showAltBtn.addEventListener("click", () => {
  dimOthers = !dimOthers;
  showAltBtn.classList.toggle("active", dimOthers);
  showRoutesBtn.classList.toggle("active", !dimOthers);
  applyRouteHighlight(selectedIdx);
});

// ==========================
// Address inputs
// ==========================
addLocationInput(); addLocationInput();
addBtn.addEventListener("click", () => addLocationInput());

function addLocationInput(value="") {
  const wrap = document.createElement("div");
  wrap.className = "location-input";
  wrap.innerHTML = `
    <input type="text" placeholder="Enter address or place" class="address" value="${escapeHtml(value)}" />
    <button class="remove-btn" title="Remove">✖</button>
  `;
  wrap.querySelector(".remove-btn").addEventListener("click", () => wrap.remove());
  locationsDiv.appendChild(wrap);
}

// ==========================
// Nominatim geocode (cache + delay)
// ==========================
const GEO_CACHE_KEY = "pubmates_geocode_cache_v1";

function loadGeoCache() {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function saveGeoCache(cache) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch {}
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocodeAddress(addr) {
  const cache = loadGeoCache();
  const key = addr.trim().toLowerCase();
  if (cache[key]) return cache[key];

  await sleep(1100); // courtesy delay

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`;
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  if (!res.ok) throw new Error(`Geocode failed (${res.status})`);
  const data = await res.json();
  if (!data.length) return null;

  const hit = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  cache[key] = hit;
  saveGeoCache(cache);
  return hit;
}

// ==========================
// OSRM: route + table
// ==========================
// OSRM expects lon,lat
async function osrmRoute(startLat, startLon, endLat, endLon) {
  const coords = `${startLon},${startLat};${endLon},${endLat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM route error (${res.status})`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No OSRM route");
  return data.routes[0]; // {distance, duration, geometry}
}

async function osrmTable(sources, destinations) {
  // sources/destinations: array of [lat,lon]
  // build combined coordinates list; use source/destination indices
  const all = [...sources, ...destinations];
  const coordStr = all.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const srcIdx = sources.map((_,i) => i).join(";");
  const dstIdx = destinations.map((_,i) => i + sources.length).join(";");

  const url = `${OSRM_BASE}/table/v1/driving/${coordStr}?sources=${srcIdx}&destinations=${dstIdx}&annotations=duration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM table error (${res.status})`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.durations) throw new Error("No OSRM table");
  return data.durations; // matrix [sources][destinations] durations in seconds
}

// Pick meetup point: sample a grid around centroid and minimize worst travel time
async function findBestMeetupPoint(coords) {
  // centroid
  let cLat = 0, cLon = 0;
  coords.forEach(([lat,lon]) => { cLat += lat; cLon += lon; });
  cLat /= coords.length; cLon /= coords.length;

  // bounding box around points
  const lats = coords.map(c => c[0]);
  const lons = coords.map(c => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);

  // sample grid (5x5) within bbox expanded a bit
  const padLat = (maxLat - minLat) * 0.15 || 0.08;
  const padLon = (maxLon - minLon) * 0.15 || 0.12;

  const gMinLat = minLat - padLat, gMaxLat = maxLat + padLat;
  const gMinLon = minLon - padLon, gMaxLon = maxLon + padLon;

  const N = 5;
  const candidates = [];
  for (let i=0;i<N;i++){
    for (let j=0;j<N;j++){
      const lat = gMinLat + (i/(N-1))*(gMaxLat - gMinLat);
      const lon = gMinLon + (j/(N-1))*(gMaxLon - gMinLon);
      candidates.push([lat, lon]);
    }
  }

  showLoading("🚗 Finding best meetup...", "Calculating travel-time grid (OSRM table)");

  // OSRM table: sources = participants, destinations = candidates
  const durations = await osrmTable(coords, candidates);

  // For each candidate, compute worst duration among participants (minimax)
  let best = { idx: 0, worst: Infinity, sum: Infinity };
  for (let d=0; d<candidates.length; d++){
    let worst = 0;
    let sum = 0;
    for (let s=0; s<coords.length; s++){
      const t = durations[s][d];
      if (t == null) { worst = Infinity; sum = Infinity; break; }
      worst = Math.max(worst, t);
      sum += t;
    }
    if (worst < best.worst || (worst === best.worst && sum < best.sum)) {
      best = { idx: d, worst, sum };
    }
  }

  const [mLat, mLon] = candidates[best.idx];
  return { lat: mLat, lon: mLon, worst_s: best.worst, sum_s: best.sum, centroid: [cLat, cLon] };
}

// ==========================
// Highlight / dim routes
// ==========================
function applyRouteHighlight(idx) {
  selectedIdx = idx;

  routeLayers.forEach(r => {
    const isSelected = (idx === null || idx === undefined) ? false : r.idx === idx;

    // If dimOthers off, everything full opacity
    const baseOpacity = dimOthers ? (isSelected ? 0.95 : 0.15) : 0.9;
    const baseWeight  = dimOthers ? (isSelected ? 7 : 4) : 5;

    r.layer.setStyle({ opacity: baseOpacity, weight: baseWeight });
  });

  // Update summary active class
  document.querySelectorAll(".route-summary .item").forEach(el => {
    const i = parseInt(el.dataset.idx, 10);
    el.classList.toggle("active", idx === i);
  });
}

// ==========================
// Nearby POIs (Overpass) - optional (only used in non-driving mode midpoint popup)
// ==========================
async function findNearbyPlaces(lat, lon, type) {
  showLoading(`🔍 Searching nearby ${type}s...`, "Querying Overpass");
  poiMarkers.forEach(m => map.removeLayer(m));
  poiMarkers = [];

  let query = "";
  switch (type) {
    case "pub": query = `[out:json];node["amenity"="pub"](around:6000,${lat},${lon});out body;`; break;
    case "park": query = `[out:json];node["leisure"="park"](around:6000,${lat},${lon});out body;`; break;
    case "creek": query = `[out:json];way["waterway"="stream"](around:6000,${lat},${lon});out center;`; break;
    case "prospecting":
      query = `[out:json];
        (node["landuse"="quarry"](around:6000,${lat},${lon});
         node["natural"="bare_rock"](around:6000,${lat},${lon});
         node["man_made"="mine"](around:6000,${lat},${lon}););
      out body;`; break;
  }

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
    const data = await res.json();
    if (!data.elements.length) { alert(`No ${type}s found nearby.`); setStatus(`⚠️ No ${type}s found`); hideLoading(); return; }

    const icons = {
      pub: "https://cdn-icons-png.flaticon.com/512/2935/2935416.png",
      park: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
      creek: "https://cdn-icons-png.flaticon.com/512/2830/2830125.png",
      prospecting: "https://cdn-icons-png.flaticon.com/512/5325/5325730.png"
    };

    data.elements.slice(0, 25).forEach(p => {
      const latP = p.lat || p.center?.lat, lonP = p.lon || p.center?.lon;
      if (!latP || !lonP) return;
      const name = p.tags?.name || `${type} spot`;
      const m = L.marker([latP, lonP], { icon: L.icon({ iconUrl: icons[type], iconSize: [30, 30] }) })
        .addTo(map)
        .bindPopup(`<b>${escapeHtml(name)}</b><br><a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${latP}&mlon=${lonP}">View on Map</a>`);
      poiMarkers.push(m);
    });

    map.fitBounds(L.latLngBounds(poiMarkers.map(m => m.getLatLng())).pad(0.3));
    setStatus(`✅ Found ${poiMarkers.length} nearby ${type}s`);
  } catch (err) {
    console.error(err);
    alert("Error fetching nearby places: " + err.message);
    setStatus("⚠️ Error fetching data");
  }
  hideLoading();
}

// ==========================
// Share link
// ==========================
function copyShareLink() {
  const shareUrl = location.href;
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert("✅ Meetup link copied to clipboard!");
    setStatus("🔗 Meetup link copied");
  }).catch(() => {
    alert("Could not copy automatically — you can copy this URL:\n\n" + shareUrl);
  });
}

// ==========================
// Main action
// ==========================
findBtn.addEventListener("click", async () => {
  try {
    showLoading("Calculating...", "Reading addresses");
    const addresses = [...document.querySelectorAll(".address")].map(i => i.value.trim()).filter(Boolean);
    if (addresses.length < 2) { alert("Please enter at least two addresses."); hideLoading(); return; }

    clearRunLayers();

    // Shareable URL (no double encoding)
    const params = new URLSearchParams();
    params.set("locations", JSON.stringify(addresses));
    params.set("driving", drivingModeToggle.checked ? "1" : "0");
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);

    // Geocode
    const coords = [];
    for (let i=0;i<addresses.length;i++){
      showLoading("Geocoding...", `Address ${i+1}/${addresses.length}`);
      const hit = await geocodeAddress(addresses[i]);
      if (hit) coords.push([hit.lat, hit.lon]);
    }
    if (coords.length < 2) { alert("Could not locate enough addresses."); hideLoading(); return; }

    // Start markers
    coords.forEach((c, i) => {
      const m = L.marker(c, {
        icon: L.icon({
          iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
          iconSize: [28, 28]
        })
      }).addTo(map).bindPopup(`📍 Location ${i + 1}<br><small style="color:${colors[i%colors.length]}">Route colour</small>`);
      startMarkers.push(m);
    });

    // Midpoint: driving mode = travel-time optimized meetup
    if (drivingModeToggle.checked) {
      const best = await findBestMeetupPoint(coords);
      const meetupLat = best.lat, meetupLon = best.lon;

      midpointMarker = L.marker([meetupLat, meetupLon], {
        icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [36, 36] })
      }).addTo(map);

      midpointMarker.bindPopup(
        `<b>🚗 Best Meetup Point</b><br>${meetupLat.toFixed(4)}, ${meetupLon.toFixed(4)}
         <br><small>Minimizes the longest drive time</small>`
      ).openPopup();

      // Draw routes
      showLoading("🧭 Drawing routes...", "Requesting OSRM routes");
      const summary = [];

      for (let i=0;i<coords.length;i++){
        const [sLat, sLon] = coords[i];
        showLoading("🧭 Drawing routes...", `Route ${i+1}/${coords.length}`);

        const route = await osrmRoute(sLat, sLon, meetupLat, meetupLon);
        const color = colors[i % colors.length];

        const geo = {
          "type":"FeatureCollection",
          "features":[{ "type":"Feature", "properties":{ "distance": route.distance, "duration": route.duration }, "geometry": route.geometry }]
        };

        const layer = L.geoJSON(geo, { style: { color, weight: 5, opacity: 0.9 } }).addTo(map);
        routeLayers.push({ idx: i, layer, color });

        summary.push({ idx: i, color, distance_m: route.distance, duration_s: route.duration });
      }

      // Fit bounds: include routes + points + meetup
      const bounds = L.latLngBounds(coords.map(c => L.latLng(c[0], c[1])));
      bounds.extend([meetupLat, meetupLon]);
      map.fitBounds(bounds.pad(0.25));

      // Render clickable summary (sorted by longest duration)
      summary.sort((a,b) => (b.duration_s||0) - (a.duration_s||0));
      routeSummary.innerHTML = summary.map(it => `
        <div class="item" data-idx="${it.idx}">
          <span class="dot" style="background:${it.color}"></span>
          <div class="meta">
            <b>Location ${it.idx + 1}</b>
            <small>${metersToNice(it.distance_m)} • ${secondsToNice(it.duration_s)}</small>
          </div>
        </div>
      `).join("");

      // Click to highlight
      routeSummary.querySelectorAll(".item").forEach(el => {
        el.addEventListener("click", () => {
          const idx = parseInt(el.dataset.idx, 10);
          applyRouteHighlight(idx);
        });
      });

      // default highlight: longest
      if (summary.length) applyRouteHighlight(summary[0].idx);

      setStatus(`✅ Routes ready • worst drive ~ ${secondsToNice(best.worst_s)}`);
      hideLoading();
      return;
    }

    // Non-driving: geographic midpoint
    let lat = 0, lon = 0;
    coords.forEach(c => { lat += c[0]; lon += c[1]; });
    lat /= coords.length; lon /= coords.length;

    map.fitBounds(L.latLngBounds(coords).pad(0.25));
    midpointMarker = L.marker([lat, lon], {
      icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [36, 36] })
    }).addTo(map);

    const popupHtml = `
      <b>🧭 Central Point</b><br>(${lat.toFixed(4)}, ${lon.toFixed(4)})<br><br>
      <div style="display:flex;justify-content:space-around;font-size:1.5em;gap:.35em;">
        <span class="map-icon" data-type="pub">🍺</span>
        <span class="map-icon" data-type="park">🌳</span>
        <span class="map-icon" data-type="creek">💧</span>
        <span class="map-icon" data-type="prospecting">⛏️</span>
      </div>
      <button id="shareBtn" style="margin-top:.6em;width:100%;padding:.6em;border-radius:12px;border:none;font-weight:800;cursor:pointer;background:linear-gradient(90deg,#ffb300,#ff6f00);color:#111;">🔗 Share Meetup</button>
      <small style="opacity:.8;">Click an icon to search nearby.</small>
    `;
    midpointMarker.bindPopup(popupHtml).openPopup();

    midpointMarker.on("popupopen", () => {
      document.querySelectorAll(".map-icon").forEach(i =>
        i.addEventListener("click", () => findNearbyPlaces(lat, lon, i.dataset.type))
      );
      const btn = document.getElementById("shareBtn");
      if (btn) btn.addEventListener("click", copyShareLink);
    });

    setStatus("🧭 Geographic midpoint ready");
    hideLoading();
  } catch (err) {
    console.error(err);
    hideLoading();
    alert("Error: " + (err?.message || err));
    setStatus("⚠️ Error");
  }
});

// ==========================
// Auto-load from shared link
// ==========================
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  if (params.has("locations")) {
    try {
      const addresses = JSON.parse(params.get("locations"));
      const driving = params.get("driving") === "1";
      locationsDiv.innerHTML = "";
      addresses.forEach(a => addLocationInput(a));
      drivingModeToggle.checked = driving;
      findBtn.click();
      setStatus("🔗 Loaded shared meetup");
    } catch (e) {
      console.warn("Bad share link:", e);
      setStatus("⚠️ Invalid share link");
    }
  }
});
