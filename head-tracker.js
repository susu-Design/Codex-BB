class HeadTracker {
  constructor(video, label, enabled = () => true) {
    this.video = video; this.label = label; this.enabled = enabled;
    this.disposed = false; this.ready = false; this.busy = false;
    this.target = null; this.pose = null; this.lastSeen = 0; this.lastPoseTime = 0;
    this.lastVideoTime = -1;
    this.status('头部追踪加载中');
    try {
      this.worker = new Worker(new URL('head-tracker-worker.js?v=4', document.baseURI));
      this.worker.onmessage = ({ data }) => {
        if (this.disposed) return;
        if (data.type === 'ready') { this.ready = true; this.status('等待头部进入画面'); }
        if (data.type === 'error') { this.fail(); return; }
        if (data.type === 'faces') {
          this.busy = false;
          if (!this.enabled()) return;
          const faces = data.faces.filter(f => Object.values(f).every(Number.isFinite));
          if (faces.length) {
            // Stay on the closest previous face instead of jumping between people.
            const previous = performance.now() - this.lastSeen < 700 ? this.target : null;
            faces.sort((a,b) => previous
              ? Math.hypot(a.x-previous.x,a.y-previous.y)-Math.hypot(b.x-previous.x,b.y-previous.y)
              : b.width*b.height-a.width*a.height);
            this.target = faces[0]; this.lastSeen = performance.now();
            this.status('头部跟随 · 本机处理');
          } else this.status('未找到头部 · 特效淡出');
        }
      };
      this.worker.onerror = () => this.fail();
      this.timeout = setTimeout(() => { if (!this.ready) this.fail(); }, 20000);
      this.timer = setInterval(() => this.sample(), 100);
    } catch { this.fail(); }
  }
  status(text) { if (this.label) this.label.textContent = text; }
  fail() {
    this.ready = false; this.target = null; this.pose = null;
    this.status('追踪不可用 · 重新开镜头可重试');
    clearInterval(this.timer); clearTimeout(this.timeout); this.worker?.terminate();
  }
  async sample() {
    if (this.disposed || !this.enabled() || document.hidden) { this.target = null; this.pose = null; return; }
    const v = this.video;
    if (!this.ready || this.busy || v.readyState < 2 || !v.videoWidth || v.currentTime === this.lastVideoTime) return;
    this.busy = true; this.lastVideoTime = v.currentTime;
    try {
      const bitmap = await createImageBitmap(v, { resizeWidth: 320,
        resizeHeight: Math.max(1, Math.round(320 * v.videoHeight / v.videoWidth)) });
      if (this.disposed || !this.ready) { bitmap.close(); this.busy = false; return; }
      this.worker.postMessage({ bitmap }, [bitmap]);
    } catch { this.busy = false; this.status('等待可读取的镜头画面'); }
  }
  // Normalized detections refer to uncropped input, not the mirrored CSS video.
  static map(face, videoWidth, videoHeight, width, height, mirrored) {
    const scale = Math.max(width / videoWidth, height / videoHeight);
    let x = face.x * videoWidth * scale - (videoWidth * scale - width) / 2;
    if (mirrored) x = width - x;
    return { x, y: face.y * videoHeight * scale - (videoHeight * scale - height) / 2,
      width: face.width * videoWidth * scale, height: face.height * videoHeight * scale,
      angle: Math.max(-.65, Math.min(.65, mirrored ? -face.angle : face.angle)) };
  }
  anchor(width, height) {
    const now = performance.now(), age = now - this.lastSeen;
    if (!this.enabled() || !this.target || age > 650 || !this.video.videoWidth) { this.pose = null; return null; }
    const mapped = HeadTracker.map(this.target, this.video.videoWidth, this.video.videoHeight, width, height,
      getComputedStyle(this.video).transform.startsWith('matrix(-1'));
    const blend = 1 - Math.exp(-Math.min(100, now - this.lastPoseTime) / 65);
    if (!this.pose || now - this.lastPoseTime > 650) this.pose = mapped;
    else for (const key of ['x','y','width','height','angle']) this.pose[key] += (mapped[key] - this.pose[key]) * blend;
    this.lastPoseTime = now;
    return { ...this.pose, opacity: Math.min(1, Math.max(0, (650 - age) / 400)) };
  }
  destroy() {
    this.disposed = true; clearTimeout(this.timeout); clearInterval(this.timer);
    this.worker?.terminate(); this.target = null; this.pose = null;
  }
}
window.HeadTracker = HeadTracker;
