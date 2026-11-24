/* Canvas renderer for Pascal pCubes geometry. Left-drag turns the selected layer;
   right/middle-drag rotates the camera; wheel zooms. */
export class PuzzleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.geometry = null;
    this.rotationY = -0.55;
    this.rotationX = 0.35;
    this.zoom = 1;
    this.pointer = null;
    this.onTurnDrag = null;
    canvas.style.touchAction = "none";
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("pointerdown", e => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      this.pointer = { id:e.pointerId, x:e.clientX, y:e.clientY, button:e.button, moved:false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", e => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      const dx=e.clientX-p.x, dy=e.clientY-p.y;
      if (Math.abs(dx)+Math.abs(dy)>3) p.moved=true;
      if (p.button !== 0) {
        this.rotationY += dx*.009;
        this.rotationX = Math.max(-1.52,Math.min(1.52,this.rotationX+dy*.009));
        this.draw();
      }
      p.x=e.clientX; p.y=e.clientY;
    });
    const finish = e => {
      const p=this.pointer;
      if (!p || (e && p.id !== e.pointerId)) return;
      if (p.button === 0 && p.moved && this.onTurnDrag) {
        const dx=e.clientX-(p.startX ?? p.x), dy=e.clientY-(p.startY ?? p.y);
        this.onTurnDrag(dx,dy);
      }
      this.pointer=null;
    };
    canvas.addEventListener("pointerup", e => {
      const p=this.pointer;
      if (!p || p.id!==e.pointerId) return;
      if (p.button===0 && p.moved && this.onTurnDrag) {
        const dx=e.clientX-p.downX, dy=e.clientY-p.downY;
        this.onTurnDrag(dx,dy);
      }
      this.pointer=null;
    });
    canvas.addEventListener("pointercancel", () => { this.pointer=null; });
    // Store the initial position separately so layer turns use the full gesture.
    canvas.addEventListener("pointerdown", e => {
      if (this.pointer && this.pointer.id===e.pointerId) {
        this.pointer.downX=e.clientX; this.pointer.downY=e.clientY;
      }
    });
    canvas.addEventListener("wheel",e=>{e.preventDefault();this.zoom=Math.max(.35,Math.min(4,this.zoom*Math.exp(-e.deltaY*.001)));this.draw();},{passive:false});
    canvas.addEventListener("dblclick",()=>this.resetView());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resetView() { this.rotationY=-.55; this.rotationX=.35; this.zoom=1; this.draw(); }
  resize() {
    const rect=this.canvas.getBoundingClientRect(), ratio=Math.max(1,window.devicePixelRatio||1);
    this.canvas.width=Math.max(1,Math.floor(rect.width*ratio));
    this.canvas.height=Math.max(1,Math.floor(rect.height*ratio));
    this.ctx.setTransform(ratio,0,0,ratio,0,0);
    this.draw();
  }
  setGeometry(geometry) { this.geometry=geometry&&Array.isArray(geometry.faces)?geometry:null; this.draw(); }
  color(value) {
    if(typeof value==="string"&&value.startsWith("#"))return value;
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)return "#65758b";
    const r=n&255,g=(n>>>8)&255,b=(n>>>16)&255;
    return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
  }
  draw() {
    const ctx=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(!w||!h)return;
    ctx.clearRect(0,0,w,h);ctx.fillStyle="#111923";ctx.fillRect(0,0,w,h);
    const faces=this.geometry?.faces||[], points=faces.flatMap(f=>f.vertices||[]);
    if(!points.length){
      ctx.textAlign="center";ctx.fillStyle="#e8edf5";ctx.font="600 18px system-ui";
      ctx.fillText("Load a pCubes puzzle XML",w/2,h/2-10);
      ctx.fillStyle="#9eacc0";ctx.font="13px system-ui";
      ctx.fillText("Left-drag turns · right-drag rotates · wheel zooms",w/2,h/2+17);return;
    }
    const cy=Math.cos(this.rotationY),sy=Math.sin(this.rotationY),cx=Math.cos(this.rotationX),sx=Math.sin(this.rotationX);
    const transform=v=>{const x=v[0]*cy+v[2]*sy,z=-v[0]*sy+v[2]*cy;return [x,v[1]*cx-z*sx,v[1]*sx+z*cx];};
    const rotated=points.map(transform),xs=rotated.map(v=>v[0]),ys=rotated.map(v=>v[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const span=Math.max(maxX-minX,maxY-minY,1e-6),scale=Math.min(w,h)*.72*this.zoom/span;
    const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
    const project=v=>[w/2+(v[0]-centerX)*scale,h/2-(v[1]-centerY)*scale];
    const ordered=faces.map((face,index)=>{const vertices=(face.vertices||[]).map(transform);return {face,vertices,depth:vertices.reduce((s,v)=>s+v[2],0)/Math.max(1,vertices.length),index};}).sort((a,b)=>a.depth-b.depth);
    for(const item of ordered){
      if(item.vertices.length<3)continue;
      ctx.beginPath();item.vertices.forEach((v,i)=>{const [x,y]=project(v);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
      ctx.closePath();ctx.fillStyle=this.color(item.face.color);ctx.fill();ctx.strokeStyle="#101820";ctx.lineWidth=1.25;ctx.stroke();
    }
  }
  destroy(){this.resizeObserver.disconnect();}
}
