export class CameraController {
  constructor(videoEl, overlayEl) {
    this.videoEl = videoEl;
    this.overlayEl = overlayEl;
    this.stream = null;
    this.cameraReady = false;
    this.torchAvailable = false;
  }

  async start(preferRear = true) {
    await this.stop();
    const constraints = {
      video: {
        facingMode: preferRear ? { ideal: 'environment' } : 'user',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;
    this.videoEl.srcObject = stream;
    await this.videoEl.play();
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    this.torchAvailable = Boolean(caps.torch);
    this.cameraReady = true;
    this.overlayEl.classList.add('hidden');
    return { torchAvailable: this.torchAvailable };
  }

  async stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.cameraReady = false;
  }

  async setTorch(enabled) {
    const track = this.stream?.getVideoTracks?.()[0];
    if (!track || !this.torchAvailable) return false;
    await track.applyConstraints({ advanced: [{ torch: enabled }] });
    return true;
  }
}
