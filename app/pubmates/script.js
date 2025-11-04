// Initialize NSW Spatial Services basemap
const map = L.map('map', {
  center: [-33.8688, 151.2093],
  zoom: 8,
  zoomControl: true
});

L.tileLayer(
  'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Base_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: '&copy; NSW Spatial Services', maxZoom: 18 }
).addTo(map);

const locationsDiv = document.getElementById("locations");
const addBtn = document.getElementById("addLocationBtn");
const findBtn = document.getElementById("findBtn");
let midpointMarker = null;
let poiMarkers = [];

// Default locations
addLocationInput();
addLocationInput();

addBtn.addEventListener("click", () => addLocationInput());

function addLocationInput() {
  const wrapper = document.createElement("div");
  wrapper.className = "location-input";
  wrapper.innerHTML = `
    <input type="text" placeholder="Enter address or place" class="address" />
    <button class="remove-btn">✖</button>
  `;
  wrapper.querySelector(".remove-btn").addEventListener("click", () => wrapper.remove());
  locationsDiv.appendChild(wrapper);
}

findBtn.addEventListener("click", async () => {
  const addresses = Array.from(document.querySelectorAll(".address"))
    .map(i => i.value.trim())
    .filter(Boolean);

  if (addresses.length < 2) {
    alert("Please enter at least two addresses.");
    return;
  }

  // Clear previous markers
  map.eachLayer(layer => {
    if (layer instanceof L.Marker && !layer._url) map.removeLayer(layer);
  });
  poiMarkers.forEach(m => map.removeLayer(m));
  poiMarkers = [];

  const coords = [];
  for (const addr of addresses) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`);
    const data = await res.json();
    if (data.length) coords.push([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
  }

  if (coords.length < 2) {
    alert("Could not locate enough addresses.");
    return;
  }

  // Plot input markers
  coords.forEach((c, i) => {
    L.marker(c, {
      icon: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
        iconSize: [28, 28]
      })
    }).addTo(map).bindPopup(`📍 Location ${i + 1}`);
  });

  // Calculate midpoint
  let lat = 0, lon = 0;
  coords.forEach(c => { lat += c[0]; lon += c[1]; });
  lat /= coords.length; lon /= coords.length;

  map.fitBounds(L.latLngBounds(coords));

  // Create midpoint marker
  if (midpointMarker) midpointMarker.remove();
  midpointMarker = L.marker([lat, lon], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
      iconSize: [36, 36]
    })
  }).addTo(map);

  const popupHtml = `
    <b>🧭 Central Point</b><br>
    (${lat.toFixed(4)}, ${lon.toFixed(4)})<br><br>
    <div style="display:flex;justify-content:space-around;font-size:1.5em;">
      <span class="map-icon" data-type="pub" title="Find pubs">🍺</span>
      <span class="map-icon" data-type="park" title="Find parks">🌳</span>
      <span class="map-icon" data-type="creek" title="Find creeks">💧</span>
      <span class="map-icon" data-type="prospecting" title="Find prospecting areas">⛏️</span>
    </div>
  `;
  midpointMarker.bindPopup(popupHtml).openPopup();

  midpointMarker.on("popupopen", () => {
    document.querySelectorAll(".map-icon").forEach(icon => {
      icon.addEventListener("click", () => {
        const type = icon.dataset.type;
        findNearbyPlaces(lat, lon, type);
      });
    });
  });
});

// Fetch nearby POIs from Overpass API
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
      query = `[out:json];(node["natural"="bare_rock"](around:6000,${lat},${lon});node["landuse"="quarry"](around:6000,${lat},${lon}););out body;`;
      break;
  }

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query
  });

  const data = await res.json();
  if (!data.elements.length) {
    alert(`No ${type}s found nearby.`);
    return;
  }

  const icons = {
    pub: "https://cdn-icons-png.flaticon.com/512/2935/2935416.png",
    park: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
    creek: "https://cdn-icons-png.flaticon.com/512/2830/2830125.png",
    prospecting: "https://cdn-icons-png.flaticon.com/512/5325/5325730.png"
  };

  data.elements.slice(0, 20).forEach(place => {
    const latP = place.lat || place.center?.lat;
    const lonP = place.lon || place.center?.lon;
    if (!latP || !lonP) return;

    const name = place.tags?.name || `${capitalize(type)} spot`;
    const marker = L.marker([latP, lonP], {
      icon: L.icon({
        iconUrl: icons[type],
        iconSize: [30, 30]
      })
    }).addTo(map);
    marker.bindPopup(`<b>${name}</b><br>
      <a target="_blank" href="https://www.openstreetmap.org/?mlat=${latP}&mlon=${lonP}">
      View on Map</a>`);
    poiMarkers.push(marker);
  });

  const bounds = L.latLngBounds(poiMarkers.map(m => m.getLatLng()));
  map.fitBounds(bounds.pad(0.2));
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
