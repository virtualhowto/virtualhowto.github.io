/* -----------------------------------------------------------
   Tide Pattern Matcher - Full Version
   app.js
----------------------------------------------------------- */

// Global state
let BEACHES = [];
let map;
let markers = [];
let selectedBeach = null;

let baseDate = null;
let baseTide = null;

let overlayResults = [];
let currentOverlayIndex = 0;

// Chart instance
let tideChart = null;

// Favourites
let favourites = [];

// DOM helper
const $ = (id) => document.getElementById(id);

/* -----------------------------------------------------------
   Utility Helpers
----------------------------------------------------------- */
function formatTime(d) {
  return dayjs(d).format("h:mm A");
}

function formatDate(d) {
  return dayjs(d).format("YYYY-MM-DD");
}

/* -----------------------------------------------------------
   Theme selection
----------------------------------------------------------- */
$("themeSelect").addEventListener("change", (e) => {
  document.body.setAttribute("data-theme", e.target.value);
});

/* -----------------------------------------------------------
   Map Initialization
----------------------------------------------------------- */
function initMap() {
  map = L.map("map").setView([-27.5, 153.0], 5); // East coast biased

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

/* -----------------------------------------------------------
   Load Beach Dataset
----------------------------------------------------------- */
async function loadBeaches() {
  try {
    const res = await fetch("australia_beaches_final.json");
    BEACHES = await res.json();
    renderBeachMarkers();
  } catch (err) {
    console.error("Failed to load beaches JSON", err);
  }
}

/* -----------------------------------------------------------
   Marker Rendering
----------------------------------------------------------- */
function renderBeachMarkers() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  const patrolledOnly = $("patrolledOnlyToggle").checked;

  BEACHES.forEach((b) => {
    if (patrolledOnly && !b.patrolled) return;

    const color = b.patrolled ? "blue" : "orange";
    const marker = L.circleMarker([b.lat, b.lng], {
      radius: 6,
      color,
      fillColor: color,
      fillOpacity: 0.9,
    }).addTo(map);

    marker.bringToFront();

    marker.on("click", () => selectBeach(b));
    markers.push(marker);
  });
}

/* -----------------------------------------------------------
   Favourites Management
----------------------------------------------------------- */
function loadFavourites() {
  const saved = localStorage.getItem("favouriteBeaches");
  favourites = saved ? JSON.parse(saved) : [];
  renderFavourites();
}

function saveFavourites() {
  localStorage.setItem("favouriteBeaches", JSON.stringify(favourites));
}

function addFavourite(beach) {
  if (!favourites.find((f) => f.name === beach.name)) {
    favourites.push(beach);
    saveFavourites();
    renderFavourites();
  }
}

function removeFavourite(name) {
  favourites = favourites.filter((f) => f.name !== name);
  saveFavourites();
    renderFavourites();
}

function isFavourite(name) {
  return favourites.some((f) => f.name === name);
}

function renderFavourites() {
  const box = $("favouritesList");

  if (!box) return;

  if (!favourites.length) {
    box.innerHTML = '<div class="text-slate-600 text-xs">No favourites yet</div>';
    return;
  }

  box.innerHTML = favourites.map((f) => `
    <div class="p-1 rounded hover:bg-slate-800 cursor-pointer flex justify-between items-center"
         data-name="${f.name}">
      <span>${f.name} <span class="text-slate-500">(${f.state || ""})</span></span>
      <button class="text-red-400 text-[10px]" data-remove="${f.name}">✕</button>
    </div>
  `).join("");

  // Click favourite to select
  [...box.querySelectorAll("[data-name]")].forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.dataset.remove) return; // handled separately
      const name = el.getAttribute("data-name");
      const beach = favourites.find((f) => f.name === name);
      if (beach) selectBeach(beach);
    });
  });

  // Remove favourite
  [...box.querySelectorAll("[data-remove]")].forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = el.getAttribute("data-remove");
      removeFavourite(name);
      const favBtn = $("favButton");
      if (selectedBeach && selectedBeach.name === name && favBtn) {
        favBtn.innerText = "⭐ Add to Favourites";
      }
    });
  });
}

/* -----------------------------------------------------------
   Select Beach
----------------------------------------------------------- */
function selectBeach(b) {
  selectedBeach = b;

  // Update UI status
  const badge = $("statusBadge");
  badge.innerText = b.name;
  badge.className =
    "text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-300 border border-green-400/40";

  // Reset tide panels
  resetTidePanels();

  // Center map
  if (map) {
    map.setView([b.lat, b.lng], 11);
  }

  // Setup favourite button
  const favBtn = $("favButton");
  if (favBtn) {
    favBtn.classList.remove("hidden");
    favBtn.innerText = isFavourite(b.name)
      ? "🗑 Remove from Favourites"
      : "⭐ Add to Favourites";

    favBtn.onclick = () => {
      if (!selectedBeach) return;
      if (isFavourite(selectedBeach.name)) {
        removeFavourite(selectedBeach.name);
        favBtn.innerText = "⭐ Add to Favourites";
      } else {
        addFavourite(selectedBeach);
        favBtn.innerText = "🗑 Remove from Favourites";
      }
    };
  }
}

/* -----------------------------------------------------------
   Reset Tide Panels
----------------------------------------------------------- */
function resetTidePanels() {
  baseTide = null;
  overlayResults = [];
  currentOverlayIndex = 0;

  $("overlayControls").classList.add("hidden");
  $("matchTile").classList.add("hidden");

  $("moonTile").classList.add("hidden");
  $("sunTile").classList.add("hidden");
  $("strengthTile").classList.add("hidden");

  if (tideChart) {
    tideChart.destroy();
    tideChart = null;
  }

  $("chartEmptyState").classList.remove("hidden");
}

/* -----------------------------------------------------------
   Search Bar for Beaches
----------------------------------------------------------- */
$("patrolledOnlyToggle").addEventListener("change", renderBeachMarkers);

$("beachSearch").addEventListener("input", () => {
  const q = $("beachSearch").value.toLowerCase();
  const box = $("beachSearchResults");

  if (q.length < 2) {
    box.classList.add("hidden");
    return;
  }

  const results = BEACHES.filter((b) =>
    b.name.toLowerCase().includes(q)
  ).slice(0, 30);

  let html = "";
  results.forEach((b) => {
    html += `<div data-name="${b.name}">${b.name} (${b.state || ""})</div>`;
  });

  box.innerHTML = html;
  box.classList.remove("hidden");

  [...box.children].forEach((el) => {
    el.addEventListener("click", () => {
      const name = el.getAttribute("data-name");
      const b = BEACHES.find((x) => x.name === name);
      if (b) selectBeach(b);
      $("beachSearchResults").classList.add("hidden");
      $("beachSearch").value = "";
    });
  });
});

/* -----------------------------------------------------------
   Hide search results on outside click
----------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const searchBox = $("beachSearchResults");
  const searchInput = $("beachSearch");

  if (!searchBox.contains(e.target) && e.target !== searchInput) {
    searchBox.classList.add("hidden");
  }
});

/* -----------------------------------------------------------
   Mock Tide Generator
----------------------------------------------------------- */
function generateTideForDate(date, lat, lng) {
  function seedRand(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  const daySeed = Number(dayjs(date).format("YYYYMMDD"));
  const r = seedRand(daySeed * lat * 0.1 + lng);

  const low1 = 0.3 + r * 0.3;
  const high1 = 1.5 + r * 0.4;
  const low2 = 0.4 + (1 - r) * 0.2;
  const high2 = 1.4 + (1 - r) * 0.3;

  const low1Time = dayjs(date).hour(2 + r * 2).minute(15);
  const high1Time = dayjs(date).hour(8 + r * 2).minute(45);
  const low2Time = dayjs(date).hour(15 + r * 2).minute(10);
  const high2Time = dayjs(date).hour(22 + r * 1).minute(5);

  return {
    date,
    readings: [
      { time: low1Time.toDate(), height: low1 },
      { time: high1Time.toDate(), height: high1 },
      { time: low2Time.toDate(), height: low2 },
      { time: high2Time.toDate(), height: high2 },
    ],
  };
}

/* -----------------------------------------------------------
   Expand Tide Curve to 30-min points
----------------------------------------------------------- */
function interpolateHeight(targetTime, readings) {
  for (let i = 0; i < readings.length - 1; i++) {
    const a = readings[i];
    const b = readings[i + 1];
    if (targetTime >= a.time && targetTime <= b.time) {
      const p = (targetTime - a.time) / (b.time - a.time);
      return a.height * (1 - p) + b.height * p;
    }
  }
  return readings[readings.length - 1].height;
}

function expandTideCurve(tide) {
  const start = dayjs(tide.date).startOf("day");
  const end = dayjs(tide.date).endOf("day");

  const points = [];
  for (let t = start; t.isBefore(end); t = t.add(30, "minute")) {
    const h = interpolateHeight(t.toDate(), tide.readings);
    points.push({ time: t.toDate(), height: h });
  }
  return points;
}

/* -----------------------------------------------------------
   Load Base Tide
----------------------------------------------------------- */
$("loadBaseBtn").addEventListener("click", () => {
  if (!selectedBeach) {
    alert("Select a beach first.");
    return;
  }
  const date = $("baseDate").value;
  if (!date) {
    alert("Select a base date.");
    return;
  }

  baseDate = date;
  baseTide = generateTideForDate(date, selectedBeach.lat, selectedBeach.lng);
  const expanded = expandTideCurve(baseTide);
  renderBaseChart(expanded);
  $("chartEmptyState").classList.add("hidden");
});

/* -----------------------------------------------------------
   Chart.js Setup
----------------------------------------------------------- */
function renderBaseChart(expanded) {
  const labels = expanded.map((p) => dayjs(p.time).format("HH:mm"));
  const data = expanded.map((p) => p.height);

  if (tideChart) tideChart.destroy();

  const ctx = $("tideChart").getContext("2d");

  tideChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Base Tide",
          data,
          borderWidth: 2,
          borderColor: "#3b82f6",
          fill: false,
          tension: 0.3,
        },
        {
          label: "Overlay Tide",
          data: [],
          borderWidth: 2,
          borderColor: "#ec4899",
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: false,
        },
      },
    },
  });
}

/* -----------------------------------------------------------
   Find Matches Button
----------------------------------------------------------- */
$("searchMatchesBtn").addEventListener("click", () => {
  if (!selectedBeach) return alert("Select a beach first.");
  if (!baseTide) return alert("You must load a base tide first.");

  const start = $("searchStart").value;
  const end = $("searchEnd").value;

  if (!start || !end) return alert("Select a search range.");

  const dates = [];
  let d = dayjs(start);
  const last = dayjs(end);
  while (d.isBefore(last) || d.isSame(last)) {
    dates.push(d.format("YYYY-MM-DD"));
    d = d.add(1, "day");
  }

  overlayResults = dates.map((dt) => {
    const tide = generateTideForDate(dt, selectedBeach.lat, selectedBeach.lng);
    const expanded = expandTideCurve(tide);
    const score = compareTides(baseTide, tide);
    return { date: dt, tide, expanded, score };
  });

  overlayResults.sort((a, b) => a.score - b.score);

  populateOverlaySelect();
  $("overlayControls").classList.remove("hidden");
  $("matchSummary").innerText =
    overlayResults.length + " matching days found.";
});

/* -----------------------------------------------------------
   Score Tide Similarity
----------------------------------------------------------- */
function compareTides(base, overlay) {
  const baseExpanded = expandTideCurve(base);
  const overlayExpanded = expandTideCurve(overlay);

  let sum = 0;
  for (let i = 0; i < baseExpanded.length; i++) {
    sum += Math.abs(baseExpanded[i].height - overlayExpanded[i].height);
  }
  return sum; // lower is better
}

/* -----------------------------------------------------------
   Populate Overlay Dropdown
----------------------------------------------------------- */
function populateOverlaySelect() {
  const sel = $("overlayDaySelect");
  sel.innerHTML = "";

  overlayResults.forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${r.date} (score: ${r.score.toFixed(3)})`;
    sel.appendChild(opt);
  });

  $("overlaySlider").min = 0;
  $("overlaySlider").max = overlayResults.length - 1;
  $("overlaySlider").value = 0;

  setOverlayIndex(0);
}

/* -----------------------------------------------------------
   Slider & Dropdown Listeners
----------------------------------------------------------- */
$("overlaySlider").addEventListener("input", () => {
  const idx = Number($("overlaySlider").value);
  setOverlayIndex(idx);
});

$("overlayDaySelect").addEventListener("change", () => {
  const idx = Number($("overlayDaySelect").value);
  $("overlaySlider").value = idx;
  setOverlayIndex(idx);
});

/* -----------------------------------------------------------
   Jump to Best Match
----------------------------------------------------------- */
$("jumpBestBtn").addEventListener("click", () => {
  const bestIdx = 0;
  $("overlaySlider").value = bestIdx;
  $("overlayDaySelect").value = bestIdx;
  setOverlayIndex(bestIdx);
});

/* -----------------------------------------------------------
   Set Current Overlay Index
----------------------------------------------------------- */
function setOverlayIndex(idx) {
  currentOverlayIndex = idx;

  const r = overlayResults[idx];
  const expanded = r.expanded.map((p) => p.height);

  if (tideChart) {
    tideChart.data.datasets[1].data = expanded;
    tideChart.update();
  }

  $("currentOverlayLabel").innerText = "Date: " + r.date;
  $("currentScoreLabel").innerText = "Score: " + r.score.toFixed(3);

  renderMatchTile(r);
  renderInsightTiles(r);
}

/* -----------------------------------------------------------
   Match Tile Renderer
----------------------------------------------------------- */
function renderMatchTile(match) {
  $("matchTile").classList.remove("hidden");

  const tide = match.tide.readings;
  const sorted = [...tide].sort((a, b) => a.time - b.time);

  const low1 = sorted[0];
  const high1 = sorted[1];
  const low2 = sorted[2];
  const high2 = sorted[3];

  const html = `
    <div class="flex flex-col gap-3">
      <div class="text-lg font-semibold text-accent">
        Match for ${match.date}
      </div>

      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div class="text-xs text-slate-400">Low Tide #1</div>
          <div class="match-value">${low1.height.toFixed(2)} m</div>
          <div class="text-slate-400">${formatTime(low1.time)}</div>
        </div>

        <div class="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div class="text-xs text-slate-400">High Tide #1</div>
          <div class="match-value">${high1.height.toFixed(2)} m</div>
          <div class="text-slate-400">${formatTime(high1.time)}</div>
        </div>

        <div class="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div class="text-xs text-slate-400">Low Tide #2</div>
          <div class="match-value">${low2.height.toFixed(2)} m</div>
          <div class="text-slate-400">${formatTime(low2.time)}</div>
        </div>

        <div class="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div class="text-xs text-slate-400">High Tide #2</div>
          <div class="match-value">${high2.height.toFixed(2)} m</div>
          <div class="text-slate-400">${formatTime(high2.time)}</div>
        </div>
      </div>

      <div class="text-xs text-slate-400 pt-1">
        These times and heights reflect the matched pattern for this day.
      </div>
    </div>
  `;

  $("matchTileBody").innerHTML = html;
}

/* -----------------------------------------------------------
   Moon Phase, Sun Cycle & Tide Strength Insights
----------------------------------------------------------- */
const MOON_EMOJI = [
  "🌑", // New
  "🌒", // Waxing Crescent
  "🌓", // First Quarter
  "🌔", // Waxing Gibbous
  "🌕", // Full
  "🌖", // Waning Gibbous
  "🌗", // Last Quarter
  "🌘", // Waning Crescent
];

function getMoonInfo(date, lat, lng) {
  const d = new Date(date + "T12:00:00");

  const illum = SunCalc.getMoonIllumination(d);
  const phase = illum.phase;
  const frac = illum.fraction;

  let idx;
  if (phase < 0.0625) idx = 0;
  else if (phase < 0.1875) idx = 1;
  else if (phase < 0.3125) idx = 2;
  else if (phase < 0.4375) idx = 3;
  else if (phase < 0.5625) idx = 4;
  else if (phase < 0.6875) idx = 5;
  else if (phase < 0.8125) idx = 6;
  else idx = 7;

  const emoji = MOON_EMOJI[idx];
  const rising = SunCalc.getMoonTimes(new Date(date), lat, lng);

  return {
    emoji,
    illumination: (frac * 100).toFixed(1),
    phaseIndex: idx,
    phaseName: [
      "New Moon",
      "Waxing Crescent",
      "First Quarter",
      "Waxing Gibbous",
      "Full Moon",
      "Waning Gibbous",
      "Last Quarter",
      "Waning Crescent",
    ][idx],
    moonrise: rising.rise || null,
    moonset: rising.set || null,
  };
}

function getSunInfo(date, lat, lng) {
  const sun = SunCalc.getTimes(new Date(date), lat, lng);
  return {
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    dawn: sun.dawn,
    dusk: sun.dusk,
  };
}

function getTideStrength(tide) {
  const heights = tide.readings.map((r) => r.height);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const range = maxH - minH;

  let level, message;
  if (range > 1.7) {
    level = "Very High";
    message = "Strong tidal motion. Great for rock pools & surf fishing.";
  } else if (range > 1.2) {
    level = "High";
    message = "Good strong tides. Excellent for detecting around low tide.";
  } else if (range > 0.7) {
    level = "Moderate";
    message = "Typical tide variation.";
  } else {
    level = "Low";
    message = "Weak tides. Calm conditions, better for swimming or kayaking.";
  }

  return {
    minH,
    maxH,
    range: range.toFixed(2),
    level,
    message,
  };
}

function renderInsightTiles(match) {
  if (!selectedBeach) return;

  const date = match.date;
  const lat = selectedBeach.lat;
  const lng = selectedBeach.lng;

  // Moon
  const moon = getMoonInfo(date, lat, lng);
  $("moonTile").classList.remove("hidden");
  $("moonTileBody").innerHTML = `
    <div class="insight-item"><span class="insight-value">${moon.emoji}</span> ${moon.phaseName}</div>
    <div class="insight-item">Illumination: <span class="insight-value">${moon.illumination}%</span></div>
    <div class="insight-item">Moonrise: <span class="insight-value">${moon.moonrise ? formatTime(moon.moonrise) : "—"}</span></div>
    <div class="insight-item">Moonset: <span class="insight-value">${moon.moonset ? formatTime(moon.moonset) : "—"}</span></div>
  `;

  // Sun
  const sun = getSunInfo(date, lat, lng);
  $("sunTile").classList.remove("hidden");
  $("sunTileBody").innerHTML = `
    <div class="insight-item">Sunrise: <span class="insight-value">${formatTime(sun.sunrise)}</span></div>
    <div class="insight-item">Sunset: <span class="insight-value">${formatTime(sun.sunset)}</span></div>
    <div class="insight-item">Dawn: <span class="insight-value">${formatTime(sun.dawn)}</span></div>
    <div class="insight-item">Dusk: <span class="insight-value">${formatTime(sun.dusk)}</span></div>
  `;

  // Tide Strength
  const strength = getTideStrength(match.tide);
  $("strengthTile").classList.remove("hidden");
  $("strengthTileBody").innerHTML = `
    <div class="insight-item">Range: <span class="insight-value">${strength.range} m</span></div>
    <div class="insight-item">Strength: <span class="insight-value">${strength.level}</span></div>
    <div class="insight-item">${strength.message}</div>
  `;
}

/* -----------------------------------------------------------
   Use Today Button
----------------------------------------------------------- */
$("useTodayBtn").addEventListener("click", () => {
  const today = dayjs().format("YYYY-MM-DD");
  $("baseDate").value = today;
});

/* -----------------------------------------------------------
   Initialization
----------------------------------------------------------- */
async function init() {
  initMap();
  await loadBeaches();
  loadFavourites();
}

init();
