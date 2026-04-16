import { CameraController } from './camera.js';
import { CaptureController } from './capture.js';
import { buildStarTrail, buildGif, downloadFramesZip } from './processing.js';
import { downloadBlob, dataURLToBlob, fmtTime } from './utils.js';
import { saveSession, loadSession, clearSession } from './storage.js';

const els = {
  video: document.getElementById('video'),
  videoOverlay: document.getElementById('videoOverlay'),
  captureCanvas: document.getElementById('captureCanvas'),
  previewCanvas: document.getElementById('previewCanvas'),
  installBtn: document.getElementById('installBtn'),
  statusPill: document.getElementById('statusPill'),
  captureBtn: document.getElementById('captureBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  swapCameraBtn: document.getElementById('swapCameraBtn'),
  captureEvery: document.getElementById('captureEvery'),
  captureEveryLabel: document.getElementById('captureEveryLabel'),
  quality: document.getElementById('quality'),
  qualityLabel: document.getElementById('qualityLabel'),
  maxFrames: document.getElementById('maxFrames'),
  useRearCamera: document.getElementById('useRearCamera'),
  torchToggle: document.getElementById('torchToggle'),
  persistToggle: document.getElementById('persistToggle'),
  frameCount: document.getElementById('frameCount'),
  captureSpan: document.getElementById('captureSpan'),
  gifFps: document.getElementById('gifFps'),
  gifFpsLabel: document.getElementById('gifFpsLabel'),
  trailOpacity: document.getElementById('trailOpacity'),
  trailOpacityLabel: document.getElementById('trailOpacityLabel'),
  buildTrailBtn: document.getElementById('buildTrailBtn'),
  buildGifBtn: document.getElementById('buildGifBtn'),
  downloadLastFrameBtn: document.getElementById('downloadLastFrameBtn'),
  downloadZipBtn: document.getElementById('downloadZipBtn'),
  clearBtn: document.getElementById('clearBtn'),
  restoreBtn: document.getElementById('restoreBtn'),
  gallery: document.getElementById('gallery'),
  trailOutput: document.getElementById('trailOutput'),
  downloadTrailBtn: document.getElementById('downloadTrailBtn'),
  gifOutput: document.getElementById('gifOutput'),
  downloadGifBtn: document.getElementById('downloadGifBtn')
};

const camera = new CameraController(els.video, els.videoOverlay);
const capture = new CaptureController(els.video, els.captureCanvas);

let frames = [];
let running = false;
let gifObjectUrl = '';
let deferredPrompt = null;

function setStatus(text) {
  els.statusPill.textContent = text;
}

function syncLabels() {
  els.captureEveryLabel.textContent = els.captureEvery.value;
  els.qualityLabel.textContent = Number(els.quality.value).toFixed(2);
  els.gifFpsLabel.textContent = els.gifFps.value;
  els.trailOpacityLabel.textContent = els.trailOpacity.value;
}

function persistFramesIfEnabled() {
  if (els.persistToggle.checked) saveSession(frames);
}

function renderGallery() {
  els.frameCount.textContent = String(frames.length);
  els.captureSpan.textContent = `${frames.length * Number(els.captureEvery.value)}s`;
  if (!frames.length) {
    els.gallery.className = 'gallery empty';
    els.gallery.textContent = 'No frames yet. Start the camera and capture a few images.';
    return;
  }
  els.gallery.className = 'gallery';
  els.gallery.innerHTML = frames.map((frame, index) => `
    <div class="thumb">
      <img src="${frame.src}" alt="Frame ${index + 1}" />
      <div class="meta">#${index + 1} · ${fmtTime(frame.ts)}</div>
    </div>
  `).join('');
}

function addFrame(frame) {
  frames.push(frame);
  const max = Math.max(10, Number(els.maxFrames.value) || 120);
  if (frames.length > max) frames.shift();
  setStatus(`Captured ${fmtTime(frame.ts)}`);
  renderGallery();
  persistFramesIfEnabled();
}

function clearOutputs() {
  if (gifObjectUrl) URL.revokeObjectURL(gifObjectUrl);
  gifObjectUrl = '';
  els.trailOutput.src = '';
  els.gifOutput.src = '';
  els.trailOutput.classList.add('hidden');
  els.downloadTrailBtn.classList.add('hidden');
  els.gifOutput.classList.add('hidden');
  els.downloadGifBtn.classList.add('hidden');
}

async function startCamera() {
  try {
    setStatus('Requesting camera access...');
    const result = await camera.start(els.useRearCamera.checked);
    els.torchToggle.disabled = !result.torchAvailable;
    els.videoOverlay.classList.add('hidden');
    setStatus('Camera ready');
  } catch (err) {
    console.error(err);
    els.videoOverlay.textContent = 'Could not access the camera. Use HTTPS, Android Chrome, and allow permission.';
    els.videoOverlay.classList.remove('hidden');
    setStatus('Camera unavailable');
  }
}

function stopInterval() {
  capture.stopInterval();
  running = false;
  setStatus('Timelapse stopped');
}

function startInterval() {
  if (running) return;
  running = true;
  capture.startInterval((frame) => addFrame(frame), Number(els.captureEvery.value), Number(els.quality.value));
  setStatus('Timelapse running');
}

async function captureNow() {
  const frame = capture.captureFrame(Number(els.quality.value));
  if (!frame) {
    setStatus('Capture failed');
    return;
  }
  addFrame(frame);
}

function restoreSavedSession() {
  const restored = loadSession();
  if (restored.length) {
    frames = restored;
    renderGallery();
    setStatus(`Restored ${restored.length} frames`);
  } else {
    setStatus('No saved session found');
  }
}

async function registerSW() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW registration failed', e); }
  }
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.installBtn.classList.remove('hidden');
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.classList.add('hidden');
  });
}

function bindEvents() {
  syncLabels();
  els.captureEvery.addEventListener('input', syncLabels);
  els.quality.addEventListener('input', syncLabels);
  els.gifFps.addEventListener('input', syncLabels);
  els.trailOpacity.addEventListener('input', syncLabels);

  els.captureBtn.addEventListener('click', captureNow);
  els.startBtn.addEventListener('click', startInterval);
  els.stopBtn.addEventListener('click', stopInterval);
  els.swapCameraBtn.addEventListener('click', async () => {
    stopInterval();
    els.useRearCamera.checked = !els.useRearCamera.checked;
    await startCamera();
  });
  els.torchToggle.addEventListener('change', async () => {
    try {
      await camera.setTorch(els.torchToggle.checked);
    } catch (e) {
      els.torchToggle.checked = false;
      setStatus('Torch not supported');
    }
  });
  els.clearBtn.addEventListener('click', async () => {
    stopInterval();
    frames = [];
    clearOutputs();
    clearSession();
    renderGallery();
    setStatus('Frames cleared');
  });
  els.restoreBtn.addEventListener('click', restoreSavedSession);

  els.buildTrailBtn.addEventListener('click', async () => {
    try {
      setStatus('Building star trail...');
      const url = await buildStarTrail(frames, els.previewCanvas, Number(els.trailOpacity.value));
      els.trailOutput.src = url;
      els.trailOutput.classList.remove('hidden');
      els.downloadTrailBtn.classList.remove('hidden');
      setStatus('Star trail ready');
    } catch (e) {
      console.error(e);
      setStatus(e.message || 'Star trail build failed');
    }
  });

  els.buildGifBtn.addEventListener('click', async () => {
    try {
      setStatus('Building GIF...');
      const blob = await buildGif(frames, Number(els.gifFps.value));
      if (gifObjectUrl) URL.revokeObjectURL(gifObjectUrl);
      gifObjectUrl = URL.createObjectURL(blob);
      els.gifOutput.src = gifObjectUrl;
      els.gifOutput.classList.remove('hidden');
      els.downloadGifBtn.classList.remove('hidden');
      setStatus('GIF ready');
    } catch (e) {
      console.error(e);
      setStatus(e.message || 'GIF build failed');
    }
  });

  els.downloadTrailBtn.addEventListener('click', () => {
    if (!els.trailOutput.src) return;
    downloadBlob(dataURLToBlob(els.trailOutput.src), `star-trail-${Date.now()}.png`);
  });

  els.downloadGifBtn.addEventListener('click', async () => {
    if (!gifObjectUrl) return;
    const blob = await fetch(gifObjectUrl).then((r) => r.blob());
    downloadBlob(blob, `timelapse-${Date.now()}.gif`);
  });

  els.downloadLastFrameBtn.addEventListener('click', () => {
    if (!frames.length) return;
    downloadBlob(dataURLToBlob(frames[frames.length - 1].src), `timelapse-frame-${frames.length}.jpg`);
  });

  els.downloadZipBtn.addEventListener('click', async () => {
    try {
      setStatus('Building ZIP...');
      const blob = await downloadFramesZip(frames);
      downloadBlob(blob, `timelapse-frames-${Date.now()}.zip`);
      setStatus('ZIP ready');
    } catch (e) {
      console.error(e);
      setStatus(e.message || 'ZIP export failed');
    }
  });
}

async function init() {
  bindEvents();
  setupInstallPrompt();
  await registerSW();
  restoreSavedSession();
  await startCamera();
}

init();
window.addEventListener('beforeunload', () => persistFramesIfEnabled());
