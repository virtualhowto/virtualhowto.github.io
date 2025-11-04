async function drawDrivingIsochrones(coords){
  const colors = ["#ff0000","#00ff00","#00b4ff","#ffa500","#ff00ff"];
  const proxyUrl = "https://pubmates-proxy.scottm.workers.dev; // <-- your Worker URL
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

  // Compute overlap if multiple zones
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
        icon: L.icon({
          iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
          iconSize: [36, 36]
        })
      }).addTo(map);
      midpointMarker.bindPopup("<b>🚗 Driving Midpoint</b><br>within 30 min reach").openPopup();
      map.fitBounds(L.geoJSON(intersection).getBounds());
    } else {
      alert("No common driving area found within 30 minutes.");
      map.fitBounds(L.latLngBounds(coords));
    }
  }
}
