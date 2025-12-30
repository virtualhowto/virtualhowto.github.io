// ==========================
// CONFIG (NO PROXY)
// ==========================
const OSRM_BASE = "https://router.project-osrm.org";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

// ==========================
// Basemaps
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
L.control.layers({
  "🌏 Australia (OSM)": osmLayer,
  "🗺️ NSW Topographic": nswTopo,
  "🛰️ NSW Imagery": nswImagery,
  "🚗 NSW Transport": nswTransport
}, null, { position: 'topright', collapsed: false }).addTo(map);

// NSW auto-switch
const nswBounds = { north: -28.15, south: -37.6, east: 153.65, west: 140.95 };
const isInNSW = (ll) => ll.lat < nswBounds.north && ll.lat > nswBounds.south && ll.lng < nswBounds.east && ll.lng > nswBounds.west;

let currentBaseLayer = osmLayer;
map.on("baselayerchange", (e) => currentBaseLayer = e.layer);
let lastInNSW = isInNSW(map.getCenter());
map.on('moveend', () => {
  const inNSW = isInNSW(map.getCenter());
  if (inNSW && !lastInNSW && currentBaseLayer === osmLayer) {
    map.removeLayer(osmLayer); map.addLayer(nswTopo); currentBaseLayer = nswTopo;
  }
  if (!inNSW && lastInNSW && [nswTopo, nswImagery, nswTransport].includes(currentBaseLayer)) {
    map.eachLayer(l => { if ([nswTopo, nswImagery, nswTransport].includes(l)) map.removeLayer(l); });
    map.addLayer(osmLayer); currentBaseLayer = osmLayer;
  }
  lastInNSW = inNSW;
});

// ==========================
// Mobile Bottom Sheet UI
// ==========================
const sidebar = document.getElementById("sidebar");
const sheetGrab = document.getElementById("sheetGrab");
const sheetToggleBtn = document.getElementById("sheetToggleBtn");
const fabPanel = document.getElementById("fabPanel");

function isMobile() { return window.matchMedia("(max-width: 768px)").matches; }
function setSheetCollapsed(collapsed) {
  if (!isMobile()) return;
  sidebar.classList.toggle("collapsed", !!collapsed);
}
function toggleSheet() {
  if (!isMobile()) return;
  sidebar.classList.toggle("collapsed");
}
sheetGrab?.addEventListener("click", toggleSheet);
sheetToggleBtn?.addEventListener("click", toggleSheet);
fabPanel?.addEventListener("click", () => setSheetCollapsed(false));

// default collapsed on mobile
window.addEventListener("DOMContentLoaded", () => {
  if (isMobile()) setSheetCollapsed(true);
});
window.addEventListener("resize", () => {
  // if switching between breakpoints, keep sane state
  if (!isMobile()) sidebar.classList.remove("collapsed");
});

// ==========================
// UI
// ==========================
const addBtn = document.getElementById("addLocationBtn");
const findBtn = document.getElementById("findBtn");
const locationsDiv = document.getElementById("locations");
const statusBar = document.getElementById("statusBar");
const routeSummary = document.getElementById("routeSummary");

const poiHint = document.getElementById("poiHint");
const poiButtons = [...document.querySelectorAll(".poi-btn")];

const calcRoutesBtn = document.getElementById("calcRoutesBtn");
const calcHint = document.getElementById("calcHint");

// ==========================
// State
// ==========================
let centerMarker = null;
let meetupMarker = null;
let poiMarkers = [];
let startMarkers = [];
let routeLayers = [];     // { idx, layer, color }

let selectedIdx = null;
let dimOthers = false;

let lastCoords = null;    // [ [lat,lon], ... ]
let lastCenter = null;    // {lat,lon}
let lastMeetup = null;    // {lat,lon,name,source}
let routesReady = false;

const colors = ["#ff0000", "#00ff00", "#00b4ff", "#ffa500", "#ff00ff", "#a855f7", "#22c55e", "#f97316"];

// ==========================
// Helpers
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
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function metersToNice(m){
  if (!m && m !== 0) return "—";
  return m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function secondsToNice(sec){
  if (!sec && sec !== 0) return "—";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600);
  const m = Math.round((sec%3600)/60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function setPoiEnabled(enabled){
  poiButtons.forEach(b => b.disabled = !enabled);
  poiHint.textContent = enabled ? "Search around the central point." : "Find a central point first.";
}

function setCalcEnabled(enabled, hintText){
  calcRoutesBtn.disabled = !enabled;
  calcHint.textContent = hintText || (enabled ? "Ready to calculate driving routes." : "Select a meetup place first.");
}

function clearRoutesOnly() {
  routeLayers.forEach(r => r.layer && map.removeLayer(r.layer));
  routeLayers = [];
  routeSummary.innerHTML = "";
  selectedIdx = null;
  routesReady = false;
  dimOthers = false;
  highlightControl?.setActive(false);
  highlightControl?.setVisible(false);
}

function clearAll() {
  [centerMarker, meetupMarker, ...poiMarkers, ...startMarkers].forEach(l => l && map.removeLayer(l));
  poiMarkers = [];
  startMarkers = [];
  centerMarker = null;
  meetupMarker = null;

  clearRoutesOnly();

  lastCoords = null;
  lastCenter = null;
  lastMeetup = null;

  setPoiEnabled(false);
  setCalcEnabled(false, "Select a meetup place first.");
}

// ==========================
// Highlight My Route control (bottom-left)
// ==========================
function applyRouteHighlight(idx) {
  selectedIdx = idx;

  routeLayers.forEach(r => {
    const isSel = (idx !== null && idx !== undefined) && r.idx === idx;
    const opacity = dimOthers ? (isSel ? 0.95 : 0.15) : 0.9;
    const weight  = dimOthers ? (isSel ? 7 : 4) : 5;
    r.layer.setStyle({ opacity, weight });
  });

  document.querySelectorAll(".route-summary .item").forEach(el => {
    const i = parseInt(el.dataset.idx, 10);
    el.classList.toggle("active", idx === i);
  });
}

const HighlightControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd: function() {
    const container = L.DomUtil.create("div", "leaflet-control pmh-control");
    const btn = L.DomUtil.create("button", "", container);
    btn.type = "button";
    btn.textContent = "🎯 Highlight My Route";

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    btn.addEventListener("click", () => {
      if (!routesReady || selectedIdx === null) return;
      dimOthers = !dimOthers;
      btn.classList.toggle("active", dimOthers);
      applyRouteHighlight(selectedIdx);
    });

    this._container = container;
    this._btn = btn;

    this.setVisible(false);
    return container;
  },
  setVisible: function(visible) {
    if (!this._container) return;
    this._container.style.display = visible ? "block" : "none";
  },
  setActive: function(active) {
    if (!this._btn) return;
    this._btn.classList.toggle("active", !!active);
  }
});

const highlightControl = new HighlightControl();
map.addControl(highlightControl);

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
function loadGeoCache(){ try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}"); } catch { return {}; } }
function saveGeoCache(cache){ try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch {} }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function geocodeAddress(addr) {
  const cache = loadGeoCache();
  const key = addr.trim().toLowerCase();
  if (cache[key]) return cache[key];

  await sleep(1100);
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
// OSRM route
// ==========================
async function osrmRoute(startLat, startLon, endLat, endLon) {
  const coords = `${startLon},${startLat};${endLon},${endLat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM route error (${res.status})`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No OSRM route");
  return data.routes[0];
}

// ==========================
// Meetup setter
// ==========================
function setMeetupPoint(meetup) {
  lastMeetup = meetup;

  // Changing meetup invalidates routes
  clearRoutesOnly();

  if (meetupMarker) map.removeLayer(meetupMarker);
  meetupMarker = L.marker([meetup.lat, meetup.lon], {
    icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [36, 36] })
  }).addTo(map);

  meetupMarker.bindPopup(
    `<b>📍 Meetup Place</b><br>${escapeHtml(meetup.name || "Selected point")}<br>
     <small>${meetup.lat.toFixed(4)}, ${meetup.lon.toFixed(4)}</small>`
  ).openPopup();

  setCalcEnabled(true, "Meetup selected — click to calculate routes.");
  setStatus(`📍 Meetup set: ${meetup.name || "Selected point"}`);
}

// ==========================
// Calculate routes button
// ==========================
calcRoutesBtn.addEventListener("click", async () => {
  if (!lastCoords || !lastMeetup) return;

  try{
    clearRoutesOnly();

    showLoading("🚗 Calculating routes...", "Requesting OSRM routes");
    const summary = [];

    for (let i=0;i<lastCoords.length;i++){
      const [sLat, sLon] = lastCoords[i];
      showLoading("🚗 Calculating routes...", `Route ${i+1}/${lastCoords.length}`);

      const route = await osrmRoute(sLat, sLon, lastMeetup.lat, lastMeetup.lon);
      const color = colors[i % colors.length];

      const geo = {
        "type":"FeatureCollection",
        "features":[{ "type":"Feature", "properties":{ "distance": route.distance, "duration": route.duration }, "geometry": route.geometry }]
      };

      const layer = L.geoJSON(geo, { style: { color, weight: 5, opacity: 0.9 } }).addTo(map);
      routeLayers.push({ idx: i, layer, color });

      summary.push({ idx: i, color, distance_m: route.distance, duration_s: route.duration });
    }

    const bounds = L.latLngBounds(lastCoords.map(c => L.latLng(c[0], c[1])));
    bounds.extend([lastMeetup.lat, lastMeetup.lon]);
    map.fitBounds(bounds.pad(0.25));

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

    routeSummary.querySelectorAll(".item").forEach(el => {
      el.addEventListener("click", () => applyRouteHighlight(parseInt(el.dataset.idx, 10)));
    });

    if (summary.length) applyRouteHighlight(summary[0].idx);

    routesReady = true;
    highlightControl.setVisible(true);
    highlightControl.setActive(false);

    hideLoading();
    setStatus("✅ Routes calculated • use bottom-left Highlight button");

    // nice mobile behavior: collapse sheet so map is visible
    if (isMobile()) setSheetCollapsed(true);

  } catch (err){
    console.error(err);
    hideLoading();
    alert("Route calculation failed: " + (err?.message || err));
    setStatus("⚠️ Route calc failed");
  }
});

// ==========================
// Overpass POIs (fallback endpoints)
// ==========================
function buildOverpassQuery(lat, lon, type, radius=6000) {
  switch (type) {
    case "pub":
      return `
[out:json][timeout:25];
(
  nwr["amenity"="pub"](around:${radius},${lat},${lon});
  nwr["amenity"="bar"](around:${radius},${lat},${lon});
);
out center tags;`;
    case "park":
      return `
[out:json][timeout:25];
(
  nwr["leisure"="park"](around:${radius},${lat},${lon});
  nwr["boundary"="national_park"](around:${radius},${lat},${lon});
);
out center tags;`;
    case "creek":
      return `
[out:json][timeout:25];
(
  nwr["waterway"="stream"](around:${radius},${lat},${lon});
  nwr["waterway"="river"](around:${radius},${lat},${lon});
);
out center tags;`;
    case "prospecting":
      return `
[out:json][timeout:25];
(
  nwr["man_made"="mine"](around:${radius},${lat},${lon});
  nwr["landuse"="quarry"](around:${radius},${lat},${lon});
  nwr["resource"="mineral"](around:${radius},${lat},${lon});
);
out center tags;`;
    default:
      return "";
  }
}

async function overpassFetch(query) {
  let lastErr = null;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: query
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Overpass failed");
}

function getElementLatLon(el) {
  if (typeof el.lat === "number" && typeof el.lon === "number") return { lat: el.lat, lon: el.lon };
  if (el.center && typeof el.center.lat === "number" && typeof el.center.lon === "number") return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

async function searchPOIs(type) {
  if (!lastCenter) return;

  showLoading(`🔍 Searching ${type}...`, "Overpass (fallback endpoints)");
  poiMarkers.forEach(m => map.removeLayer(m));
  poiMarkers = [];

  try {
    const q = buildOverpassQuery(lastCenter.lat, lastCenter.lon, type, 6000);
    const data = await overpassFetch(q);
    const els = (data.elements || []).slice(0, 40);

    if (!els.length) {
      hideLoading();
      setStatus(`⚠️ No ${type} found`);
      alert(`No ${type} found near the central point.`);
      return;
    }

    const icons = {
      pub: "https://cdn-icons-png.flaticon.com/512/2935/2935416.png",
      park: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
      creek: "https://cdn-icons-png.flaticon.com/512/2830/2830125.png",
      prospecting: "https://cdn-icons-png.flaticon.com/512/5325/5325730.png"
    };

    els.forEach(el => {
      const p = getElementLatLon(el);
      if (!p) return;

      const name = el.tags?.name || `${type} spot`;
      const m = L.marker([p.lat, p.lon], {
        icon: L.icon({ iconUrl: icons[type], iconSize: [30, 30] })
      }).addTo(map);

      m.on("click", () => setMeetupPoint({ lat: p.lat, lon: p.lon, name, source: "poi" }));

      m.bindPopup(
        `<b>${escapeHtml(name)}</b><br>
         <small>Click marker to set meetup</small><br>
         <a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}">View on OSM</a>`
      );

      poiMarkers.push(m);
    });

    map.fitBounds(L.latLngBounds(poiMarkers.map(m => m.getLatLng())).pad(0.25));
    hideLoading();
    setStatus(`✅ Found ${poiMarkers.length} POIs • click one to set meetup`);

    // mobile nicety: collapse so user can see POIs on map
    if (isMobile()) setSheetCollapsed(true);

  } catch (err) {
    console.error(err);
    hideLoading();
    setStatus("⚠️ POI search failed");
    alert("POI search failed (Overpass can be rate-limited). Try again in 30–60 seconds.");
  }
}

poiButtons.forEach(btn => btn.addEventListener("click", () => searchPOIs(btn.dataset.type)));

// ==========================
// Find central point
// ==========================
findBtn.addEventListener("click", async () => {
  try {
    showLoading("Calculating...", "Reading addresses");

    const addresses = [...document.querySelectorAll(".address")]
      .map(i => i.value.trim()).filter(Boolean);

    if (addresses.length < 2) {
      alert("Please enter at least two addresses.");
      hideLoading();
      return;
    }

    clearAll();

    // Shareable URL
    const params = new URLSearchParams();
    params.set("locations", JSON.stringify(addresses));
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);

    // Geocode
    const coords = [];
    for (let i=0;i<addresses.length;i++){
      showLoading("Geocoding...", `Address ${i+1}/${addresses.length}`);
      const hit = await geocodeAddress(addresses[i]);
      if (hit) coords.push([hit.lat, hit.lon]);
    }
    if (coords.length < 2) {
      alert("Could not locate enough addresses.");
      hideLoading();
      return;
    }

    lastCoords = coords;

    coords.forEach((c, i) => {
      const m = L.marker(c, {
        icon: L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [28, 28] })
      }).addTo(map).bindPopup(`📍 Location ${i + 1}`);
      startMarkers.push(m);
    });

    let lat = 0, lon = 0;
    coords.forEach(c => { lat += c[0]; lon += c[1]; });
    lat /= coords.length; lon /= coords.length;

    lastCenter = { lat, lon };

    centerMarker = L.circleMarker([lat, lon], {
      radius: 10,
      weight: 2,
      color: "#ffffff",
      fillColor: "#ffb300",
      fillOpacity: 0.85
    }).addTo(map);
    centerMarker.bindPopup(`<b>🧭 Central Point</b><br>${lat.toFixed(4)}, ${lon.toFixed(4)}<br><small>Now search POIs</small>`).openPopup();

    setMeetupPoint({ lat, lon, name: "Central Point", source: "center" });
    setPoiEnabled(true);
    setCalcEnabled(true, "Meetup selected — click to calculate routes.");

    const bounds = L.latLngBounds(coords.map(c => L.latLng(c[0], c[1])));
    bounds.extend([lat, lon]);
    map.fitBounds(bounds.pad(0.25));

    hideLoading();
    setStatus("✅ Central point found • pick a POI meetup");

    // mobile: collapse so map is primary
    if (isMobile()) setSheetCollapsed(true);

  } catch (err) {
    console.error(err);
    hideLoading();
    alert("Error: " + (err?.message || err));
    setStatus("⚠️ Error");
  }
});

// ==========================
// Auto-load share link
// ==========================
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  if (params.has("locations")) {
    try {
      const addresses = JSON.parse(params.get("locations"));
      locationsDiv.innerHTML = "";
      addresses.forEach(a => addLocationInput(a));
      findBtn.click();
      setStatus("🔗 Loaded shared meetup");
    } catch {
      setStatus("⚠️ Invalid share link");
    }
  }
});
