// Initialize map using NSW Spatial Services Topographic basemap
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
let activeType = "pub";

// Add two default location fields
addLocationInput();
addLocationInput();

// Add new input field
addBtn.addEventListener("click", () => addLocationInput());

// Handle icon selection
document.querySelectorAll(".icon-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".icon-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeType = btn.dataset.type;
  });
});
document.querySelector('.icon-btn[data-type="pub"]').classList.add("active");

// Add a new address input with remove button
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

// Main find function
findBtn.addEventListener("click", async () => {
  const addresses = Array.from(document.querySelectorAll(".address"))
    .map(i => i.value.trim())
    .filter(Boolean);

  if (addresses.length < 2) {
    alert("Please enter at least two addresses.");
    return;
  }

  map.eachLayer(layer => {
    if (layer instanceof L.Marker && !layer._url) map.removeLayer(layer);
  });

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

  // Fit all markers
  map.fitBounds(L.latLngBounds(coords));

  // Show midpoint marker
  const icons = {
    pub: "https://cdn-icons-png.flaticon.com/512/2935/2935416.png",
    park: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
    creek: "https://cdn-icons-png.flaticon.com/512/2830/2830125.png",
    prospecting: "https://cdn-icons-png.flaticon.com/512/5325/5325730.png"
  };

  const midpoint = L.marker([lat, lon], {
    icon: L.icon({
      iconUrl: icons[activeType],
      iconSize: [36, 36]
    })
  }).addTo(map);

  midpoint.bindPopup(`<b>🧭 Central ${capitalize(activeType)} Spot!</b><br>(${lat.toFixed(4)}, ${lon.toFixed(4)})`).openPopup();
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
