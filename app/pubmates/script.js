const map = L.map('map').setView([-33.8688, 151.2093], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const locationsDiv = document.getElementById("locations");
const addBtn = document.getElementById("addLocationBtn");

addBtn.addEventListener("click", () => {
  const count = document.querySelectorAll(".address").length + 1;
  const wrapper = document.createElement("div");
  wrapper.className = "address-group";
  wrapper.innerHTML = `
    <input type="text" placeholder="Enter address ${count}" class="address" />
    <button class="remove-btn" title="Remove address">✖</button>
  `;
  wrapper.querySelector(".remove-btn").addEventListener("click", () => wrapper.remove());
  locationsDiv.appendChild(wrapper);
});

document.getElementById("findBtn").addEventListener("click", async () => {
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

  let lat = 0, lon = 0;
  coords.forEach(c => { lat += c[0]; lon += c[1]; });
  lat /= coords.length; lon /= coords.length;

  map.setView([lat, lon], 12);
  L.marker([lat, lon]).addTo(map).bindPopup("🍻 Central point!").openPopup();

  coords.forEach((c, i) => {
    L.marker(c, {
      icon: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
        iconSize: [28, 28]
      })
    }).addTo(map).bindPopup(`📍 Address ${i + 1}`);
  });

  const type = document.getElementById("type").value;
  const query = `[out:json];node["amenity"="${type}"](around:5000,${lat},${lon});out body;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
    const data = await res.json();

    if (!data.elements.length) {
      alert(`No ${type}s found nearby.`);
      return;
    }

    data.elements.slice(0, 10).forEach(place => {
      const name = place.tags.name || `${type.charAt(0).toUpperCase() + type.slice(1)} (Unnamed)`;
      L.marker([place.lat, place.lon], {
        icon: L.icon({
          iconUrl: type === "pub"
            ? "https://cdn-icons-png.flaticon.com/512/2935/2935416.png"
            : "https://cdn-icons-png.flaticon.com/512/616/616408.png",
          iconSize: [30, 30]
        })
      }).addTo(map)
        .bindPopup(`<b>${name}</b><br>
          <a target="_blank" href="https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}">
          View on Map</a>`);
    });
  } catch (err) {
    alert("Error fetching nearby places.");
    console.error(err);
  }
});

window.addEventListener('resize', () => map.invalidateSize());
