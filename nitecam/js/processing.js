import { loadImage, dataURLToBlob, addBlobToZip } from './utils.js';

export async function buildStarTrail(frames, previewCanvas, opacityPct = 70) {
  if (!frames || frames.length < 2) throw new Error('Need at least 2 frames');
  const baseImg = await loadImage(frames[0].src);
  previewCanvas.width = baseImg.width;
  previewCanvas.height = baseImg.height;
  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(baseImg, 0, 0);
  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = Math.min(1, Math.max(0.05, opacityPct / 100));
  for (let i = 1; i < frames.length; i++) {
    const img = await loadImage(frames[i].src);
    ctx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return previewCanvas.toDataURL('image/png');
}

export async function buildGif(frames, fps = 6) {
  if (!frames || frames.length < 2) throw new Error('Need at least 2 frames');
  if (!window.GIF) throw new Error('GIF library unavailable');

  const first = await loadImage(frames[0].src);
  const canvas = document.createElement('canvas');
  canvas.width = first.width;
  canvas.height = first.height;
  const ctx = canvas.getContext('2d');
  const delay = Math.max(50, Math.round(1000 / Math.max(1, fps)));

  return await new Promise(async (resolve, reject) => {
    try {
      const gif = new window.GIF({
        workers: 2,
        quality: 10,
        width: canvas.width,
        height: canvas.height,
        workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
      });
      for (const frame of frames) {
        const img = await loadImage(frame.src);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        gif.addFrame(canvas, { copy: true, delay });
      }
      gif.on('finished', (blob) => resolve(blob));
      gif.on('abort', () => reject(new Error('GIF creation aborted')));
      gif.render();
    } catch (err) {
      reject(err);
    }
  });
}

export async function downloadFramesZip(frames) {
  if (!frames?.length) throw new Error('No frames to download');
  if (!window.JSZip) throw new Error('ZIP library unavailable');
  const zip = new window.JSZip();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const blob = dataURLToBlob(frame.src);
    await addBlobToZip(zip, `frames/frame-${String(i + 1).padStart(4, '0')}.jpg`, blob);
  }
  const readme = new Blob([
    `Android Camera Timelapse Studio\n\nCaptured frames: ${frames.length}\nExported: ${new Date().toISOString()}\n`
  ], { type: 'text/plain' });
  await addBlobToZip(zip, 'README.txt', readme);
  return await zip.generateAsync({ type: 'blob' });
}
