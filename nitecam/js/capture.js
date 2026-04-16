export class CaptureController {
  constructor(videoEl, canvasEl) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.intervalId = null;
  }

  captureFrame(quality = 0.92) {
    const video = this.videoEl;
    const canvas = this.canvasEl;
    const ctx = canvas.getContext('2d');
    if (!ctx || !video.videoWidth || !video.videoHeight) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      src: canvas.toDataURL('image/jpeg', quality),
      ts: Date.now()
    };
  }

  startInterval(onCapture, seconds = 5, quality = 0.92) {
    this.stopInterval();
    const take = () => {
      const frame = this.captureFrame(quality);
      if (frame) onCapture(frame);
    };
    take();
    this.intervalId = window.setInterval(take, Math.max(1, seconds) * 1000);
  }

  stopInterval() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
