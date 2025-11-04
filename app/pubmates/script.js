
// ==========================
// National + NSW Hybrid Basemaps
// ==========================
const osmLayer = L.tileLayer(
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
);
const nswTopo = L.tileLayer(
  'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Base_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: '&copy; NSW Spatial Services', maxZoom: 18 }
);
const nswImagery = L.tileLayer(
  'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: '&copy; NSW Spatial Services', maxZoom: 18 }
);
const nswTransport = L.tileLayer(
  'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Transport/MapServer/tile/{z}/{y}/{x}',
  { attribution: '&copy; NSW Spatial Services', maxZoom: 18 }
);

// Initialize map
const map = L.map('map', {
  center: [-25.0, 134.0],
  zoom: 5,
  zoomControl: true,
  layers: [osmLayer]
});

// Layer selector
const baseMaps = {
  "🌏 Australia (OSM)": osmLayer,
  "🗺️ NSW Topographic": nswTopo,
  "🛰️ NSW Imagery": nswImagery,
  "🚗 NSW Transport": nswTransport
};
L.control.layers(baseMaps, null, { position: 'topright', collapsed: false }).addTo(map);

// NSW bounding box for auto-switch
const nswBounds = { north: -28.15, south: -37.6, east: 153.65, west: 140.95 };

// Automatically switch layers when entering/exiting NSW
map.on('moveend', () => {
  const c = map.getCenter();
  const inNSW = (
    c.lat < nswBounds.north &&
    c.lat > nswBounds.south &&
    c.lng < nswBounds.east &&
    c.lng > nswBounds.west
  );
  if (inNSW && map.hasLayer(osmLayer)) {
    map.removeLayer(osmLayer);
    map.addLayer(nswTopo);
  }
  if (!inNSW && (map.hasLayer(nswTopo) || map.hasLayer(nswImagery) || map.hasLayer(nswTransport))) {
    map.eachLayer(l => {
      if ([nswTopo, nswImagery, nswTransport].includes(l)) map.removeLayer(l);
    });
    map.addLayer(osmLayer);
  }
});

// ==========================
// Sidebar + Globals
// ==========================
const addBtn = document.getElementById("addLocationBtn");
const findBtn = document.getElementById("findBtn");
const locationsDiv = document.getElementById("locations");
const drivingModeToggle = document.getElementById("drivingMode");

let midpointMarker = null, poiMarkers = [], driveLayers = [];

addLocationInput(); addLocationInput();
addBtn.addEventListener("click", addLocationInput);

function addLocationInput() {
  const wrap = document.createElement("div");
  wrap.className = "location-input";
  wrap.innerHTML = `
    <input type="text" placeholder="Enter address or place" class="address" />
    <button class="remove-btn">✖</button>
  `;
  wrap.querySelector(".remove-btn").addEventListener("click", () => wrap.remove());
  locationsDiv.appendChild(wrap);
}

// ==========================
// Find Button Logic
// ==========================
findBtn.addEventListener("click", async () => {
  const addresses = [...document.querySelectorAll(".address")].map(i => i.value.trim()).filter(Boolean);
  if (addresses.length < 2) { alert("Please enter at least two addresses."); return; }

  // Clear existing markers and layers
  [midpointMarker, ...poiMarkers, ...driveLayers].forEach(l => l && map.removeLayer(l));
  poiMarkers = []; driveLayers = [];

  // Geocode addresses
  const coords = [];
  for (const addr of addresses) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`);
    const data = await res.json();
    if (data.length) coords.push([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
  }
  if (coords.length < 2) { alert("Could not locate enough addresses."); return; }

  // Plot each address
  coords.forEach((c, i) => {
    L.marker(c, { icon: L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [28, 28] }) })
      .addTo(map).bindPopup(`📍 Location ${i + 1}`);
  });

  // Geographic midpoint
  let lat = 0, lon = 0;
  coords.forEach(c => { lat += c[0]; lon += c[1]; });
  lat /= coords.length; lon /= coords.length;

  // Choose mode
  if (drivingModeToggle.checked) {
    await drawDrivingIsochrones(coords);
  } else {
    map.fitBounds(L.latLngBounds(coords));
    midpointMarker = L.marker([lat, lon], {
      icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [36, 36] })
    }).addTo(map);
    const popupHtml = `
      <b>🧭 Central Point</b><br>(${lat.toFixed(4)}, ${lon.toFixed(4)})<br><br>
      <div style="display:flex;justify-content:space-around;font-size:1.5em;">
        <span class="map-icon" data-type="pub">🍺</span>
        <span class="map-icon" data-type="park">🌳</span>
        <span class="map-icon" data-type="creek">💧</span>
        <span class="map-icon" data-type="prospecting">⛏️</span>
      </div><small>Click an icon to search nearby.</small>`;
    midpointMarker.bindPopup(popupHtml).openPopup();
    midpointMarker.on("popupopen", () =>
      document.querySelectorAll(".map-icon").forEach(i =>
        i.addEventListener("click", () => findNearbyPlaces(lat, lon, i.dataset.type)))
    );
  }
});

// ==========================
// Driving Isochrone Mode (via Cloudflare Proxy)
// ==========================
async function drawDrivingIsochrones(coords) {
  const colors = ["#ff0000", "#00ff00", "#00b4ff", "#ffa500", "#ff00ff"];
  const proxyUrl = "https://https://pubmates-proxy.scottm.workers.dev"; // <-- replace with your Worker URL
  const layers = [];

  for (let i = 0; i < coords.length; i++) {
    const [lat, lon] = coords[i];
    try {
      const res = await fetch(`${proxyUrl}?lat=${lat}&lon=${lon}&range=1800`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const layer = L.geoJSON(data, {
        color: colors[i % colors.length],
        weight: 2,
        fillOpacity: 0.2
      }).addTo(map);
      layers.push(layer);
    } catch (err) {
      console.error("Proxy error:", err);
      alert("Error retrieving drive zone: " + err.message);
    }
  }

  driveLayers = layers;

  // Find intersection of all drive zones
  if (layers.length > 1) {
    let intersection = layers[0].toGeoJSON();
    for (let i = 1; i < layers.length; i++) {
      intersection = turf.intersect(intersection, layers[i].toGeoJSON());
      if (!intersection) break;
    }
    if (intersection) {
      const center = turf.center(intersection);
      const [lon, lat] = center.geometry.coordinates;
      midpointMarker = L.marker([lat, lon], {
        icon: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [36, 36] })
      }).addTo(map);
      midpointMarker.bindPopup("<b>🚗 Driving Midpoint</b><br>within 30 min reach").openPopup();
      map.fitBounds(L.geoJSON(intersection).getBounds());
    } else {
      alert("No common driving area found within 30 minutes.");
      map.fitBounds(L.latLngBounds(coords));
    }
  }
}

// ==========================
// Nearby POI Search (Overpass API)
// ==========================
async function findNearbyPlaces(lat, lon, type) {
  poiMarkers.forEach(m => map.removeLayer(m));
  poiMarkers = [];

  let query = "";
  switch (type) {
    case "pub":
      query = `[out:json];node["amenity"="pub"](around:6000,${lat},${lon});out body;`;
      break;
    case "park":
      query = `[out:json];node["leisure"="park"](around:6000,${lat},${lon});out body;`;
      break;
    case "creek":
      query = `[out:json];way["waterway"="stream"](around:6000,${lat},${lon});out center;`;
      break;
    case "prospecting":
      query = `[out:json];
        (node["landuse"="quarry"](around:6000,${lat},${lon});
         node["natural"="bare_rock"](around:6000,${lat},${lon});
         node["man_made"="mine"](around:6000,${lat},${lon}););
      out body;`;
      break;
  }

  const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
  const data = await res.json();
  if (!data.elements.length) { alert(`No ${type}s found nearby.`); return; }

  const icons = {
    pub: "https://cdn-icons-png.flaticon.com/512/2935/2935416.png",
    park: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
    creek: "https://cdn-icons-png.flaticon.com/512/2830/2830125.png",
    prospecting: "https://cdn-icons-png.flaticon.com/512/5325/5325730.png"
  };

  data.elements.slice(0, 25).forEach(p => {
    const latP = p.lat || p.center?.lat, lonP = p.lon || p.center?.lon;
    if (!latP || !lonP) return;
    const name = p.tags?.name || `${capitalize(type)} spot`;
    const m = L.marker([latP, lonP], {
      icon: L.icon({ iconUrl: icons[type], iconSize: [30, 30] })
    }).addTo(map);
    m.bindPopup(`<b>${name}</b><br>
      <a target="_blank" href="https://www.openstreetmap.org/?mlat=${latP}&mlon=${lonP}">
      View on Map</a>`);
    poiMarkers.push(m);
  });

  map.fitBounds(L.latLngBounds(poiMarkers.map(m => m.getLatLng())).pad(0.3));
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
