// ===== GLOBAL STATE =====
let stream = null;
let captureInterval = null;
let captureEvery = 5;
let frames = [];

let lastCaptureTime = null;
let nextCaptureIn = 0;
let nightMode = false;

// ===== INIT =====
window.onload = () => {
  setupUI();
  startCamera();
};

// ===== CAMERA =====
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    const video = document.getElementById("video");
    video.srcObject = stream;
    await video.play();

  } catch (err) {
    alert("Camera access failed. Use HTTPS and allow permissions.");
    console.error(err);
  }
}

// ===== CAPTURE =====
function captureFrame() {
  const video = document.getElementById("video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.drawImage(video, 0, 0);

  const data = canvas.toDataURL("image/jpeg", 0.9);

  frames.push(data);

  lastCaptureTime = Date.now();

  renderGallery();
}

// ===== TIMELAPSE =====
function startTimelapse() {
  stopTimelapse();

  captureFrame(); // instant first shot
  lastCaptureTime = Date.now();

  captureInterval = setInterval(() => {
    captureFrame();
  }, captureEvery * 1000);
}

function stopTimelapse() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
}

// ===== COUNTDOWN + PROGRESS =====
setInterval(() => {
  if (!lastCaptureTime) return;

  const now = Date.now();
  const elapsed = (now - lastCaptureTime) / 1000;
  const remaining = Math.max(0, captureEvery - elapsed);

  const countdownEl = document.getElementById("countdown");
  if (countdownEl) {
    countdownEl.innerText = `Next shot in: ${remaining.toFixed(1)}s`;
  }

  const progress = ((captureEvery - remaining) / captureEvery) * 100;

  const bar = document.getElementById("progressBar");
  if (bar) {
    bar.style.width = progress + "%";
  }

}, 100);

// ===== GALLERY =====
function renderGallery() {
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = "";

  frames.slice(-50).forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    img.style.width = "60px";
    img.style.margin = "2px";
    gallery.appendChild(img);
  });
}

// ===== STAR TRAIL =====
async function buildStarTrail() {
  if (frames.length < 2) {
    alert("Need more frames");
    return;
  }

  const img = await loadImage(frames[0]);

  const canvas = document.getElementById("outputCanvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);

  ctx.globalCompositeOperation = "lighten";

  for (let i = 1; i < frames.length; i++) {
    const frame = await loadImage(frames[i]);
    ctx.drawImage(frame, 0, 0);
  }

  ctx.globalCompositeOperation = "source-over";
}

// ===== GIF =====
async function buildGIF() {
  if (frames.length < 2) return;

  const gif = new GIF({
    workers: 2,
    quality: 10
  });

  for (let src of frames) {
    const img = await loadImage(src);
    gif.addFrame(img, { delay: 200 });
  }

  gif.on("finished", (blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url);
  });

  gif.render();
}

// ===== HELPERS =====
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

// ===== NIGHT MODE =====
function toggleNightMode() {
  nightMode = !nightMode;

  document.body.style.background = nightMode ? "#000" : "#111";
  document.body.style.color = nightMode ? "#ffcc66" : "#fff";

  const overlay = document.getElementById("nightOverlay");
  if (overlay) {
    overlay.style.display = nightMode ? "block" : "none";
  }
}

// ===== UI SETUP =====
function setupUI() {
  // Inject countdown UI
  const controls = document.getElementById("controls");

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div style="margin-top:15px;">
      <div id="countdown">Next shot in: 0s</div>
      <div style="height:10px;background:#333;border-radius:5px;">
        <div id="progressBar" style="height:10px;width:0%;background:white;border-radius:5px;"></div>
      </div>
    </div>

    <button onclick="toggleNightMode()" style="margin-top:10px;">
      Toggle Night Mode
    </button>

    <div id="nightOverlay" style="
      display:none;
      position:fixed;
      top:0;
      left:0;
      width:100%;
      height:100%;
      background:rgba(255,140,0,0.08);
      pointer-events:none;
    "></div>
  `;

  controls.appendChild(wrapper);
}