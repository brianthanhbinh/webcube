/* Direct-manipulation puzzle renderer:
   left-drag turns the layer under the pointer; right-drag rotates the camera;
   wheel zooms. */
export class PuzzleRenderer {
  constructor(canvas) {
    this.canvas=canvas;
    this.ctx=canvas.getContext("2d");
    this.geometry=null;
    this.rotationY=-0.55;
    this.rotationX=0.35;
    this.zoom=1;
    this.pointer=null;
    this.projectedFaces=[];
    this.onTurnDrag=null;
    this.onTurnCommit=null;
    this.cameraSnapEnabled=false;
    canvas.style.touchAction="none";
    canvas.addEventListener("contextmenu",e=>e.preventDefault());
    canvas.addEventListener("pointerdown",e=>{
      if(e.button!==0&&e.button!==1&&e.button!==2)return;
      const rect=canvas.getBoundingClientRect();
      const axes=window.pCubes?.getAxesInfo?.()||[];
      const pick=e.button===0?this.pickLayer(e.clientX-rect.left,e.clientY-rect.top,axes):null;
      if(pick){canvas.dataset.pickedAxis=String(pick.axis);canvas.dataset.pickedLayer=String(pick.layer);}
      else{delete canvas.dataset.pickedAxis;delete canvas.dataset.pickedLayer;}
      const axis=pick&&axes.find(a=>a.index===pick.axis);
      this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,button:e.button,moved:false,pick,
        before:pick?this.geometry:null,axis,previewAngle:0};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove",e=>{
      const p=this.pointer;
      if(!p||p.id!==e.pointerId)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(Math.abs(e.clientX-p.downX)+Math.abs(e.clientY-p.downY)>4)p.moved=true;
      if(p.button===2||p.button===1){
        this.rotationY+=dx*.009;
        this.rotationX=Math.max(-1.52,Math.min(1.52,this.rotationX+dy*.009));
        this.draw();
      } else if(p.button===0&&p.pick&&p.axis&&p.before){
        const drag=Math.abs(e.clientX-p.downX)>=Math.abs(e.clientY-p.downY)
          ? e.clientX-p.downX : -(e.clientY-p.downY);
        const step=Number(p.axis.angle)||Math.PI/2;
        p.previewAngle=drag/110*step*(p.pick.normalSign||1);
        this.previewTurn(p.before,p.axis,p.pick.layer,p.pick.normalSign||1,p.previewAngle);
      }
      p.x=e.clientX;p.y=e.clientY;
    });
    canvas.addEventListener("pointerup",e=>{
      const p=this.pointer;
      if(!p||p.id!==e.pointerId)return;
      if(p.button===0&&p.pick&&p.axis&&p.before){
        const step=Math.abs(Number(p.axis.angle)||Math.PI/2);
        const turns=Math.round(p.previewAngle/step);
        if(turns&&this.onTurnCommit)this.onTurnCommit(p.pick,turns,p.before,p.axis,p.previewAngle);
        else this.animateSnapBack(p.before,p.axis,p.pick.layer,p.pick.normalSign||1,p.previewAngle);
      } else if((p.button===2||p.button===1)&&this.cameraSnapEnabled){
        this.snapCameraTo45();
      } else if(p.button===0&&p.moved&&this.onTurnDrag){
        this.onTurnDrag(e.clientX-p.downX,e.clientY-p.downY,p.pick);
      }
      this.pointer=null;
    });
    canvas.addEventListener("pointercancel",()=>{this.pointer=null;});
    canvas.addEventListener("lostpointercapture",()=>{this.pointer=null;});
    canvas.addEventListener("wheel",e=>{
      e.preventDefault();
      this.zoom=Math.max(.35,Math.min(4,this.zoom*Math.exp(-e.deltaY*.001)));
      this.draw();
    },{passive:false});
    canvas.addEventListener("dblclick",()=>this.resetView());
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  layerFaceMask(geometry, axis, layer, normalSign = 1) {
    const faces = geometry?.faces || [];
    const vector = [Number(axis?.x), Number(axis?.y), Number(axis?.z)];
    const length = Math.hypot(...vector);
    if (!length || !faces.length) return [];
    const n = vector.map(v => v / length);

    // First find the parallel outer faces. Their planes identify the requested
    // layer, but they are NOT the complete layer: side faces have perpendicular
    // normals and must rotate with the same cubies.
    const surfaceValues = [];
    for (const face of faces) {
      const vertices = face.vertices || [];
      const normal = this.faceNormal(vertices);
      if (!normal || this.dot(normal, n) * normalSign < .82) continue;
      const center = vertices.reduce(
        (sum, v) => sum.map((x, k) => x + Number(v[k]) / vertices.length),
        [0, 0, 0]
      );
      const value = this.dot(center, n);
      if (!surfaceValues.some(old => Math.abs(old - value) < 1e-4))
        surfaceValues.push(value);
    }
    surfaceValues.sort((a, b) => a - b);
    if (!surfaceValues.length) return [];

    const selectedSurface = surfaceValues[Math.max(0, Math.min(
      surfaceValues.length - 1,
      Math.round(layer * (surfaceValues.length - 1) /
        Math.max(1, (axis.layers || surfaceValues.length) - 1))
    ))];

    // Estimate layer thickness from the spacing between adjacent parallel
    // surface planes. The cubie center lies half a layer inward from the
    // selected outer surface. Include faces by their center's axial position,
    // regardless of their own normal, so side faces rotate too.
    const gaps = [];
    for (let i = 1; i < surfaceValues.length; i++) {
      const gap = surfaceValues[i] - surfaceValues[i - 1];
      if (gap > 1e-4) gaps.push(gap);
    }
    const spacing = gaps.length
      ? gaps[Math.floor(gaps.length / 2)]
      : 0;
    if (!spacing) {
      // A one-layer object has no neighboring plane from which to infer its
      // thickness; retain a conservative coplanar selection.
      return faces.map(face => {
        const vertices = face.vertices || [];
        if (!vertices.length) return false;
        const center = vertices.reduce(
          (sum, v) => sum.map((x, k) => x + Number(v[k]) / vertices.length),
          [0, 0, 0]
        );
        return Math.abs(this.dot(center, n) - selectedSurface) < 1e-4;
      });
    }

    const layerCenter = selectedSurface - normalSign * spacing / 2;
    const tolerance = spacing * 0.55 + 1e-4;
    const selected = faces.map(face => {
      const vertices = face.vertices || [];
      if (!vertices.length) return false;
      const center = vertices.reduce(
        (sum, v) => sum.map((x, k) => x + Number(v[k]) / vertices.length),
        [0, 0, 0]
      );
      const centerProjection = this.dot(center, n);
      const normal = this.faceNormal(vertices);
      // Include the sticker/outer polygon on the selected surface itself,
      // plus every side polygon belonging to the same cubie slice. The prior
      // center-only test excluded the grabbed outer face, making turns look
      // like a single sticker peeling away.
      const isSelectedOuterFace = normal &&
        this.dot(normal, n) * normalSign >= .82 &&
        Math.abs(centerProjection - selectedSurface) <= 1e-4;
      const isSelectedCubieSide = Math.abs(centerProjection - layerCenter) <= tolerance;
      return Boolean(isSelectedOuterFace || isSelectedCubieSide);
    });

    // Polyhedral cuts (notably Megaminx) expose several polygons per physical
    // piece. Expand each hit face to the rest of its connected piece.
    if (this.geometryKind === "minx") {
      const vertexFaces = new Map();
      faces.forEach((face, faceIndex) => {
        for (const vertex of face.vertices || []) {
          const key = vertex.map(value => Number(value).toFixed(5)).join(",");
          if (!vertexFaces.has(key)) vertexFaces.set(key, []);
          vertexFaces.get(key).push(faceIndex);
        }
      });
      const expanded = selected.slice();
      const queue = selected.map((yes, index) => yes ? index : -1).filter(index => index >= 0);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], counts = new Map();
        for (const vertex of faces[index].vertices || []) {
          const key = vertex.map(value => Number(value).toFixed(5)).join(",");
          for (const neighbor of vertexFaces.get(key) || []) {
            if (neighbor !== index) counts.set(neighbor, (counts.get(neighbor) || 0) + 1);
          }
        }
        for (const [neighbor, shared] of counts) {
          if (shared >= 2 && !expanded[neighbor]) {
            expanded[neighbor] = true;
            queue.push(neighbor);
          }
        }
      }
      return expanded;
    }
    return selected;
  }
  animateTurn(before, after, axis, angle, duration = 220, startAngle = 0, layer = 0, normalSign = 1) {
    if (!before?.faces || !after?.faces || !axis || !Number.isFinite(angle)) {
      this.setGeometry(after); return;
    }
    if (this.turnFrame) cancelAnimationFrame(this.turnFrame);
    const mask = this.layerFaceMask(before, axis, layer, normalSign);
    const vector = [Number(axis.x), Number(axis.y), Number(axis.z)];
    const length = Math.hypot(...vector);
    if (!length || !mask.some(Boolean)) { this.setGeometry(after); return; }
    const n = vector.map(v => v / length);
    const start = performance.now();
    const smooth = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
    const frame = now => {
      const t = Math.min(1, Math.max(0, (now - start) / Math.max(1, duration)));
      const theta = startAngle + (angle - startAngle) * smooth(t), c = Math.cos(theta), s = Math.sin(theta);
      const geometry = {faces: before.faces.map((face, i) => {
        if (!mask[i]) return face;
        return {...face, vertices: face.vertices.map(v => {
          const d = v.map(Number), cross = [
            n[1]*d[2]-n[2]*d[1], n[2]*d[0]-n[0]*d[2], n[0]*d[1]-n[1]*d[0]
          ];
          const dot = this.dot(n, d);
          return d.map((x, k) => x*c + cross[k]*s + n[k]*dot*(1-c));
        })};
      })};
      this.setGeometry(geometry);
      if (t < 1) this.turnFrame = requestAnimationFrame(frame);
      else { this.turnFrame = 0; this.setGeometry(after); }
    };
    this.turnFrame = requestAnimationFrame(frame);
  }
  animateSnapBack(before, axis, layer, normalSign, fromAngle, duration = 150) {
    this.animateTurn(before, before, axis, 0, duration, fromAngle, layer, normalSign);
  }
  previewTurn(before, axis, layer, normalSign, angle) {
    const vector = [Number(axis.x), Number(axis.y), Number(axis.z)];
    const length = Math.hypot(...vector);
    if (!length) { this.setGeometry(before); return; }
    const n = vector.map(v => v / length), mask = this.layerFaceMask(before, axis, layer, normalSign);
    const c = Math.cos(angle), s = Math.sin(angle);
    const faces = before.faces.map((face, i) => {
      if (!mask[i]) return face;
      return {...face, vertices: face.vertices.map(v => {
        const d = v.map(Number), cross = [
          n[1]*d[2]-n[2]*d[1], n[2]*d[0]-n[0]*d[2], n[0]*d[1]-n[1]*d[0]
        ];
        const dot = this.dot(n, d);
        return d.map((x, k) => x*c + cross[k]*s + n[k]*dot*(1-c));
      })};
    });
    this.setGeometry({faces});
  }
  snapCameraTo45(duration = 180){
    if(this.cameraSnapFrame)cancelAnimationFrame(this.cameraSnapFrame);
    const step=Math.PI/4;
    const startX=this.rotationX,startY=this.rotationY;
    const targetX=Math.max(-Math.PI/2,Math.min(Math.PI/2,Math.round(startX/step)*step));
    const targetY=Math.round(startY/step)*step;
    const start=performance.now();
    const smooth=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    const frame=now=>{
      const t=Math.min(1,Math.max(0,(now-start)/Math.max(1,duration)));
      const eased=smooth(t);
      this.rotationX=startX+(targetX-startX)*eased;
      this.rotationY=startY+(targetY-startY)*eased;
      this.draw();
      if(t<1)this.cameraSnapFrame=requestAnimationFrame(frame);
      else{this.cameraSnapFrame=0;this.rotationX=targetX;this.rotationY=targetY;this.draw();}
    };
    this.cameraSnapFrame=requestAnimationFrame(frame);
  }
  resetView(){this.rotationY=-.55;this.rotationX=.35;this.zoom=1;this.draw();}
  resize(){
    const rect=this.canvas.getBoundingClientRect(),ratio=Math.max(1,window.devicePixelRatio||1);
    this.canvas.width=Math.max(1,Math.floor(rect.width*ratio));
    this.canvas.height=Math.max(1,Math.floor(rect.height*ratio));
    this.ctx.setTransform(ratio,0,0,ratio,0,0);
    this.draw();
  }
  setGeometry(geometry){this.geometry=geometry&&Array.isArray(geometry.faces)?geometry:null;this.draw();}
  color(value){
    if(typeof value==="string"&&value.startsWith("#"))return value;
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)return "#65758b";
    const r=n&255,g=(n>>>8)&255,b=(n>>>16)&255;
    return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
  }
  dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  faceNormal(vertices){
    if(!vertices||vertices.length<3)return null;
    const a=vertices[1].map((v,i)=>v-vertices[0][i]),b=vertices[2].map((v,i)=>v-vertices[0][i]);
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const length=Math.hypot(...n);
    return length>1e-8?n.map(v=>v/length):null;
  }
  pointInPolygon(x,y,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
    }
    return inside;
  }
  pickLayer(x,y,axes){
    // Test frontmost polygons first so overlapping cubies select the visible face.
    for(let i=this.projectedFaces.length-1;i>=0;i--){
      const item=this.projectedFaces[i];
      if(item.screen.length<3||!this.pointInPolygon(x,y,item.screen))continue;
      const normal=this.faceNormal(item.vertices);
      if(!normal)continue;
      let chosen=null,best=.72;
      for(const axis of axes){
        const vector=[Number(axis.x),Number(axis.y),Number(axis.z)],length=Math.hypot(...vector);
        if(!length)continue;
        const score=Math.abs(this.dot(normal,vector.map(v=>v/length)));
        if(score>best){best=score;chosen={axis:axis.index,vector:vector.map(v=>v/length),layers:axis.layers,sign:this.dot(normal,vector.map(v=>v/length))>=0?1:-1};}
      }
      if(!chosen||!chosen.layers)continue;
      const cent=item.vertices.reduce((sum,v)=>sum.map((n,k)=>n+v[k]/item.vertices.length),[0,0,0]);
      const coordinate=this.dot(cent,chosen.vector);
      const values=[];
      for(const face of this.projectedFaces){
        const n=this.faceNormal(face.vertices);
        if(!n||this.dot(n,chosen.vector)*chosen.sign<.82)continue;
        const c=face.vertices.reduce((sum,v)=>sum.map((z,k)=>z+v[k]/face.vertices.length),[0,0,0]);
        const value=this.dot(c,chosen.vector);
        if(!values.some(old=>Math.abs(old-value)<1e-4))values.push(value);
      }
      values.sort((a,b)=>a-b);
      let layer=0,bestDistance=Infinity;
      values.forEach((v,index)=>{const d=Math.abs(v-coordinate);if(d<bestDistance){bestDistance=d;layer=index;}});
      if(values.length!==chosen.layers&&values.length>1)
        layer=Math.round(layer*(chosen.layers-1)/(values.length-1));
      layer=Math.max(0,Math.min(chosen.layers-1,layer));
      return {axis:chosen.axis,layer,normalSign:chosen.sign,faceNormal:normal};
    }
    return null;
  }
  draw(){
    const ctx=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(!w||!h)return;
    ctx.clearRect(0,0,w,h);ctx.fillStyle="#111923";ctx.fillRect(0,0,w,h);
    const faces=this.geometry?.faces||[],points=faces.flatMap(f=>f.vertices||[]);
    if(!points.length){
      this.projectedFaces=[];
      ctx.textAlign="center";ctx.fillStyle="#e8edf5";ctx.font="600 18px system-ui";
      ctx.fillText("Load a pCubes puzzle XML",w/2,h/2-10);
      ctx.fillStyle="#9eacc0";ctx.font="13px system-ui";
      ctx.fillText("Left-drag a layer · right-drag to rotate camera · wheel to zoom",w/2,h/2+17);return;
    }
    const cy=Math.cos(this.rotationY),sy=Math.sin(this.rotationY),cx=Math.cos(this.rotationX),sx=Math.sin(this.rotationX);
    const transform=v=>{const x=v[0]*cy+v[2]*sy,z=-v[0]*sy+v[2]*cy;return[x,v[1]*cx-z*sx,v[1]*sx+z*cx];};
    const rotated=points.map(transform),xs=rotated.map(v=>v[0]),ys=rotated.map(v=>v[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const span=Math.max(maxX-minX,maxY-minY,1e-6),scale=Math.min(w,h)*.68*this.zoom/span;
    const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
    const project=v=>[w/2+(v[0]-centerX)*scale,h/2-(v[1]-centerY)*scale];
    const ordered=faces.map((face,index)=>{
      const vertices=face.vertices||[],viewVertices=vertices.map(transform);
      return{face,vertices,viewVertices,screen:viewVertices.map(project),depth:viewVertices.reduce((s,v)=>s+v[2],0)/Math.max(1,viewVertices.length),index};
    }).sort((a,b)=>a.depth-b.depth);
    this.projectedFaces=ordered;
    for(const item of ordered){
      if(item.screen.length<3)continue;
      ctx.beginPath();item.screen.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
      ctx.closePath();ctx.fillStyle=this.color(item.face.color);ctx.fill();ctx.strokeStyle="#101820";ctx.lineWidth=1.25;ctx.stroke();
    }
  }
  destroy(){this.resizeObserver.disconnect();}
}
