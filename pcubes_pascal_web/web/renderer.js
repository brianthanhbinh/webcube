/* Draws face geometry exported by the Pascal pCubes model. */
export class PuzzleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.geometry = null;
    this.rotationY = -0.55;
    this.rotationX = 0.35;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  setGeometry(geometry) {
    this.geometry = geometry && Array.isArray(geometry.faces) ? geometry : null;
    this.draw();
  }

  color(value) {
    if (typeof value === "string" && value.startsWith("#")) return value;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "#65758b";
    const r = n & 255, g = (n >>> 8) & 255, b = (n >>> 16) & 255;
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  }

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#111923";
    ctx.fillRect(0, 0, width, height);

    const faces = this.geometry?.faces || [];
    const points = faces.flatMap(face => face.vertices || []);
    if (!points.length) {
      ctx.strokeStyle = "rgba(125, 151, 184, .10)";
      ctx.lineWidth = 1;
      for (let x = width / 2 % 32; x < width; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = height / 2 % 32; y < height; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8edf5";
      ctx.font = "600 18px system-ui";
      ctx.fillText("Load a pCubes puzzle XML", width / 2, height / 2 - 10);
      ctx.fillStyle = "#9eacc0";
      ctx.font = "13px system-ui";
      ctx.fillText("The Pascal engine will supply the puzzle geometry.", width / 2, height / 2 + 17);
      return;
    }

    const cosY = Math.cos(this.rotationY), sinY = Math.sin(this.rotationY);
    const cosX = Math.cos(this.rotationX), sinX = Math.sin(this.rotationX);
    const rotated = points.map(v => {
      const x = v[0], y = v[1], z = v[2];
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      return [x1, y * cosX - z1 * sinX, y * sinX + z1 * cosX];
    });
    const xs = rotated.map(v => v[0]), ys = rotated.map(v => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 1e-6);
    const scale = Math.min(width, height) * 0.72 / span;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const project = v => [width / 2 + (v[0] - centerX) * scale,
                          height / 2 - (v[1] - centerY) * scale];

    const ordered = faces.map((face, index) => {
      const vertices = face.vertices || [];
      const transformed = vertices.map(v => {
        const x = v[0], y = v[1], z = v[2];
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        return [x1, y * cosX - z1 * sinX, y * sinX + z1 * cosX];
      });
      return { face, vertices: transformed,
        depth: transformed.reduce((sum, v) => sum + v[2], 0) / Math.max(1, transformed.length),
        index };
    }).sort((a, b) => a.depth - b.depth);

    for (const item of ordered) {
      if (item.vertices.length < 3) continue;
      ctx.beginPath();
      item.vertices.forEach((v, i) => {
        const [x, y] = project(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = this.color(item.face.color);
      ctx.fill();
      ctx.strokeStyle = "#101820";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  destroy() { this.resizeObserver.disconnect(); }
}