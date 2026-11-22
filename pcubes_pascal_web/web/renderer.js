/* Browser-only drawing layer. Pascal supplies model geometry; this module
   projects and paints it without moving puzzle rules into JavaScript. */
export class PuzzleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.geometry = null;
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

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#111923";
    ctx.fillRect(0, 0, width, height);

    if (!this.geometry || this.geometry.faces.length === 0) {
      ctx.strokeStyle = "rgba(125, 151, 184, .10)";
      ctx.lineWidth = 1;
      const step = 32;
      for (let x = width / 2 % step; x < width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = height / 2 % step; y < height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8edf5";
      ctx.font = "600 18px system-ui";
      ctx.fillText("No puzzle geometry yet", width / 2, height / 2 - 10);
      ctx.fillStyle = "#9eacc0";
      ctx.font = "13px system-ui";
      ctx.fillText("The Canvas renderer is ready for faces exported by Pascal.", width / 2, height / 2 + 17);
      return;
    }

    const vertices = this.geometry.faces.flatMap(face => face.vertices || []);
    if (!vertices.length) return;
    const xs = vertices.map(v => v[0]), ys = vertices.map(v => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 1e-6);
    const scale = Math.min(width, height) * 0.78 / span;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const project = v => [
      width / 2 + (v[0] - centerX) * scale,
      height / 2 - (v[1] - centerY) * scale
    ];

    for (const face of this.geometry.faces) {
      if (!Array.isArray(face.vertices) || face.vertices.length < 3) continue;
      ctx.beginPath();
      face.vertices.forEach((v, i) => {
        const [x, y] = project(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = face.color || "#4b83bd";
      ctx.fill();
      ctx.strokeStyle = "#101820";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  destroy() {
    this.resizeObserver.disconnect();
  }
}