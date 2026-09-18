/* Procedural, transparent VFX. Never transforms the video or its container. */
class RagePainter {
  constructor(canvas, readState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.readState = readState;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.size = { w: 0, h: 0 };
    this.last = 0;
    this.disposed = false;
    this.observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      this.size = { w: width, h: height };
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    this.observer.observe(canvas);
    this.frame = requestAnimationFrame(t => this.tick(t));
  }
  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.ctx.clearRect(0, 0, this.size.w, this.size.h);
  }
  tick(ms) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(t => this.tick(t));
    if (document.hidden || ms - this.last < 32) return;
    this.last = ms;
    const { tier = 0, burst = false, enabled = true, anchor, style = 'purple' } = this.readState();
    const { w, h } = this.size;
    if (!w || !h) return;
    this.ctx.clearRect(0, 0, w, h);
    this.canvas.style.opacity = anchor ? anchor.opacity : 1;
    if (!enabled || !tier || anchor === null) return;
    const t = this.motion.matches ? 4.2 : ms / 1000;
    this.ctx.save();
    if (anchor) {
      this.ctx.translate(anchor.x, anchor.y);
      this.ctx.rotate(anchor.angle);
      const scale = Math.max(.15, Math.min(3, anchor.width / 150));
      this.ctx.scale(scale, scale);
      this.ctx.translate(-240, -145);
    } else this.ctx.scale(w / 480, h / 360);
    const initial = tier === 1;
    if (initial) { this.ctx.save(); this.ctx.globalAlpha = .30; }
    if (style === 'green') {
      this.greenAtmosphere(t, tier);
      this.greenFlames(t, tier);
      this.greenSparks(t, tier);
      if (tier === 3) this.greenEnergy(t, burst && !this.motion.matches);
    } else {
      // Purple always uses the Unity-derived palette; the old gold phase is retired.
      this.atmosphere(t, 3);
      this.corona(t, 3);
      this.flames(t, 3);
      this.sparks(t, 3);
      if (tier === 3) this.energy(t, burst && !this.motion.matches);
    }
    if (initial) this.ctx.restore();
    // A soft clear zone protects the face even when particle paths cross it.
    this.ctx.globalCompositeOperation = 'destination-out';
    const mask = this.ctx.createRadialGradient(240, 145, 55, 240, 145, 113);
    mask.addColorStop(0, '#000'); mask.addColorStop(.5, '#000'); mask.addColorStop(1, '#0000');
    this.ctx.fillStyle = mask; this.ctx.fillRect(120, 20, 240, 250);
    this.ctx.restore();
  }
  random(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
  greenAtmosphere(t, tier) {
    const c = this.ctx;
    const shade = c.createRadialGradient(240, 150, 72, 240, 170, 300);
    shade.addColorStop(0, '#020b0600'); shade.addColorStop(.58, '#062b1418'); shade.addColorStop(1, '#00140782');
    c.fillStyle = shade; c.fillRect(0, 0, 480, 360);
    const haze = c.createLinearGradient(0, 105, 0, 360);
    haze.addColorStop(0, '#39ff7000'); haze.addColorStop(.48, '#31e85924'); haze.addColorStop(1, '#62ff493e');
    c.fillStyle = haze; c.fillRect(0, 80, 480, 280);
    for (const x of [22, 458]) {
      const g = c.createRadialGradient(x, 245, 0, x, 245, 245);
      g.addColorStop(0, '#86ff393e'); g.addColorStop(.46, '#29d45e22'); g.addColorStop(1, '#0000');
      c.fillStyle = g; c.fillRect(0, 0, 480, 360);
    }
    c.save(); c.translate(240, 346); c.scale(1, .13);
    for (let ring = 0; ring < 4; ring++) {
      c.globalAlpha = .7 - ring * .12; c.strokeStyle = ring % 2 ? '#cfff72' : '#54f45f'; c.lineWidth = 2 + ring;
      c.beginPath();
      for (let i = 0; i <= 100; i++) {
        const a = i / 100 * Math.PI * 2;
        const r = 95 + ring * 27 + Math.sin(a * (9 + ring) - t * 4) * 9;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (!i) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); c.stroke();
    }
    c.restore(); c.globalAlpha = 1;
  }
  greenFlames(t, tier) {
    const c = this.ctx;
    c.save(); c.globalCompositeOperation = 'screen';
    for (let side = 0; side < 2; side++) {
      c.save(); if (side) { c.translate(480, 0); c.scale(-1, 1); }
      for (let i = 0; i < 29; i++) {
        const seed = this.random(i + side * 51 + 9);
        const phase = t * (1.35 + seed * 1.15) + i * 2.17;
        const lane = i / 29;
        const x = 4 + lane * 126 + seed * 18;
        const height = (130 + this.random(i + 74) * 215) * (.86 + .14 * Math.sin(phase));
        const tipX = x + 10 + Math.sin(phase * .8) * 25;
        const tipY = 382 - height;
        const width = 7 + this.random(i + 117) * 19;
        for (let pass = 0; pass < 3; pass++) {
          const scale = [1, .5, .16][pass];
          const g = c.createLinearGradient(0, 380, 0, tipY);
          const color = ['#28bd49', '#a3ff24', '#efffa2'][pass];
          g.addColorStop(0, `${color}00`); g.addColorStop(.18, `${color}8c`);
          g.addColorStop(.62, `${color}c8`); g.addColorStop(1, `${color}10`);
          c.fillStyle = g; c.globalAlpha = .48 + tier * .08;
          c.beginPath(); c.moveTo(x - width * scale, 380);
          c.bezierCurveTo(x - width * scale - 10, 295, tipX - 20 * scale, tipY + 70, tipX, tipY);
          c.bezierCurveTo(tipX + 2, tipY + 45, x + width * scale + 14, 294, x + width * scale, 380);
          c.closePath(); c.fill();
        }
      }
      c.restore();
    }
    c.restore(); c.globalAlpha = 1;
  }
  greenSparks(t, tier) {
    const c = this.ctx;
    for (let i = 0; i < 124; i++) {
      const p = (t * (.13 + this.random(i + 41) * .34) + this.random(i * 3 + 2)) % 1;
      const side = i % 2 ? 1 : -1;
      const x = 240 + side * (94 + this.random(i + 15) * 145) + Math.sin(p * 10 + i) * 13;
      const y = 378 - p * 430;
      c.globalAlpha = Math.sin(p * Math.PI) * (.5 + tier * .13);
      c.fillStyle = i % 5 ? '#b8ff35' : '#eaffc4';
      c.save(); c.translate(x, y); c.rotate(i * 2.4 + t * .4);
      c.beginPath(); c.moveTo(-1, 5); c.lineTo(2, 0); c.lineTo(0, -7); c.lineTo(-2, 0); c.closePath(); c.fill(); c.restore();
    }
    c.globalAlpha = 1;
  }
  greenEnergy(t, burst) {
    const c = this.ctx;
    c.save(); c.globalCompositeOperation = 'screen';
    for (let branch = 0; branch < 18; branch++) {
      const side = branch % 2 ? 1 : -1;
      const step = Math.floor(t * (burst ? 15 : 8));
      const baseX = 240 + side * (126 + this.random(branch + 3) * 78);
      const baseY = 28 + (branch % 7) * 43;
      const points = [];
      for (let j = 0; j < 8; j++) {
        const x = baseX + side * j * 8 + (this.random(step * 47 + branch * 19 + j) - .5) * 25;
        const y = baseY + j * 13 + (this.random(step * 23 + branch * 11 + j) - .5) * 15;
        points.push([x, y]);
      }
      const pulse = Math.pow(Math.max(0, Math.sin(t * 8 + branch * 1.7)), 3);
      c.globalAlpha = (burst ? .85 : .42) * (.25 + pulse * .75);
      for (let pass = 0; pass < 3; pass++) {
        c.strokeStyle = ['#24d96030', '#74ffd8aa', '#efffff'][pass]; c.lineWidth = [6, 2.2, .65][pass];
        c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      }
    }
    c.restore(); c.globalAlpha = 1;
  }
  atmosphere(t, tier) {
    const c = this.ctx;
    const purple = tier === 3;
    const shade = c.createRadialGradient(240, 145, 80, 240, 175, 310);
    shade.addColorStop(0, '#08061200'); shade.addColorStop(.6, '#08061212'); shade.addColorStop(1, '#08061265');
    c.fillStyle = shade; c.fillRect(0, 0, 480, 360);
    for (const x of [38, 442]) {
      const g = c.createRadialGradient(x, 265, 0, x, 265, 215);
      g.addColorStop(0, purple ? '#7223b238' : '#df391638');
      g.addColorStop(.55, purple ? '#64229320' : '#f77d1620');
      g.addColorStop(1, '#0000');
      c.fillStyle = g; c.fillRect(0, 0, 480, 360);
    }
    // Low, elliptical energy bed, not an opaque screen wash.
    c.save(); c.translate(240, 350); c.scale(1, .12);
    const g = c.createRadialGradient(0, 0, 105, 0, 0, 227);
    g.addColorStop(0, '#0000'); g.addColorStop(.7, purple ? '#d075ff70' : '#ffb33670'); g.addColorStop(1, '#0000');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 227, 0, Math.PI * 2); c.fill(); c.restore();
  }
  flames(t, tier) {
    const c = this.ctx, purple = tier === 3;
    c.globalCompositeOperation = 'screen';
    // Continuous tapered ribbons: wide roots, hooked tips, nested hot cores.
    for (let side = 0; side < 2; side++) {
      c.save();
      if (side) { c.translate(480, 0); c.scale(-1, 1); }
      for (let i = 0; i < 17; i++) {
        c.globalAlpha = .36;
        const seed = this.random(i + 15);
        const phase = t * (1.2 + seed * .9) + i * 2.3;
        const x = 9 + seed * 88;
        const tall = 110 + this.random(i + 61) * 175;
        const height = tall * (.85 + .13 * Math.sin(phase));
        const tipX = x + 14 + 18 * Math.sin(phase * .72);
        const tipY = 378 - height;
        const width = 9 + this.random(i + 70) * 23;
        for (let core = 0; core < 3; core++) {
          const scale = [1, .56, .19][core];
          const g = c.createLinearGradient(0, 365, 0, tipY);
          const colors = purple ? ['#9225e6', '#e45cfa', '#fff0ff'] : ['#f54a16', '#ffb226', '#fff1ab'];
          g.addColorStop(0, `${colors[core]}00`);
          g.addColorStop(.22, `${colors[core]}a0`);
          g.addColorStop(.65, `${colors[core]}c0`);
          g.addColorStop(1, `${colors[core]}18`);
          c.fillStyle = g;
          c.beginPath(); c.moveTo(x - width * scale, 375);
          c.bezierCurveTo(x - width * scale - 17, 296, tipX - 28 * scale, tipY + 70, tipX, tipY);
          c.bezierCurveTo(tipX - 5, tipY + 48, x + width * scale + 22, 300, x + width * scale, 375);
          c.closePath(); c.fill();
        }
      }
      // Fine outward-stripping flame fragments, spaced irregularly.
      for (let i = 0; i < 12; i++) {
        const p = (t * .42 + this.random(i + 130)) % 1;
        const x = 35 + this.random(i + 170) * 88 + Math.sin(p * 9 + i) * 17;
        const y = 340 - p * 320;
        c.globalAlpha = Math.sin(p * Math.PI) * .7;
        c.strokeStyle = purple ? '#e8a5ff' : '#ffe5a0'; c.lineWidth = .8;
        c.beginPath(); c.moveTo(x, y + 21); c.quadraticCurveTo(x - 11, y + 8, x + 3, y - 16); c.stroke();
      }
      c.globalAlpha = 1; c.restore();
    }
    c.globalCompositeOperation = 'source-over';
  }
  corona(t, tier) {
    const c = this.ctx, purple = tier === 3;
    const points = [];
    for (let i = 0; i < 100; i++) {
      const a = i / 100 * Math.PI * 2;
      const spike = i % 3 === 0 ? 13 + 13 * Math.sin(i * 1.7 + t * 2) : 0;
      const wave = Math.sin(i * .49 - t * 2.1) * 5;
      points.push([240 + Math.cos(a) * (179 + wave + spike), 247 + Math.sin(a) * (225 + wave + spike)]);
    }
    c.save();
    c.globalAlpha = .45;
    const g = c.createLinearGradient(0, 0, 0, 365);
    g.addColorStop(0, purple ? '#de8aff85' : '#ffed8985');
    g.addColorStop(.65, purple ? '#b137e833' : '#ff812333');
    g.addColorStop(1, '#0000');
    c.fillStyle = g;
    c.beginPath(); points.forEach(([x,y],i)=>i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
    c.ellipse(240, 251, 157, 204, 0, 0, Math.PI * 2);
    c.fill('evenodd');
    // Thin hot contours keep the silhouette graphic rather than foggy.
    c.strokeStyle = purple ? '#f2b4ff90' : '#fff3ae90'; c.lineWidth = 1.1;
    c.beginPath(); points.forEach(([x,y],i)=>i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.stroke();
    c.restore();
  }
  sparks(t, tier) {
    const c = this.ctx;
    for (let i = 0; i < 58; i++) {
      const p = (t * (.17 + this.random(i + 80) * .3) + this.random(i)) % 1;
      const side = i % 2 ? 1 : -1;
      const x = 240 + side * (115 + this.random(i + 5) * 115) + Math.sin(p * 8 + i) * 9;
      const y = 370 - p * 395;
      const r = .5 + this.random(i + 48) * 1.4;
      c.globalAlpha = Math.sin(p * Math.PI) * .9;
      c.fillStyle = tier === 3 ? '#f1c0ff' : '#ffdc8b';
      c.beginPath(); c.ellipse(x, y, r * .55, r * 2.5, .3, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }
  energy(t, burst) {
    const c = this.ctx;
    c.save(); c.globalCompositeOperation = 'screen';
    // Curved streaks wrap around a clear central silhouette.
    for (let i = 0; i < 9; i++) {
      const phase = (t * .24 + i / 9) % 1;
      const y = 400 - phase * 460;
      c.globalAlpha = Math.sin(phase * Math.PI) * (burst ? .65 : .22);
      c.strokeStyle = i % 2 ? '#f7baff' : '#ae6bf4';
      c.lineWidth = i % 3 === 0 ? 2 : .8;
      c.beginPath(); c.moveTo(24, y + 70);
      c.bezierCurveTo(-15, y - 45, 35, y - 135, 124, y - 162); c.stroke();
      c.beginPath(); c.moveTo(456, y + 40);
      c.bezierCurveTo(505, y - 35, 441, y - 157, 356, y - 176); c.stroke();
    }
    c.globalAlpha = burst ? .85 : .32;
    for (let side = 0; side < 2; side++) {
      const points = [];
      const step = Math.floor(t * 8);
      for (let j = 0; j < 13; j++) {
        const x = 40 + Math.sin(j * .6 + t * 1.5) * 18 + (this.random(step * 31 + j * 7 + side) - .5) * 26;
        points.push([side ? 480 - x : x, 18 + j * 26]);
      }
      for (let pass = 0; pass < 3; pass++) {
        c.lineWidth = [7, 2.5, .85][pass];
        c.strokeStyle = ['#a83ff72e', '#d57fff9a', '#fff0ff'][pass];
        c.beginPath(); points.forEach(([x,y],j)=>j ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke();
        if (pass > 0) for (const j of [3,8]) {
          const [x,y] = points[j]; const s = side ? -1 : 1;
          c.beginPath(); c.moveTo(x,y); c.lineTo(x+s*19,y+10); c.lineTo(x+s*14,y+25); c.lineTo(x+s*32,y+40); c.stroke();
        }
      }
    }
    c.restore();
  }
}
window.RagePainter = RagePainter;
