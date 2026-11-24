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
      // One pointer gesture owns the canvas until it is released; a second
      // pointer/button cannot replace the active layer drag mid-turn.
      if(this.pointer)return;
      if(e.button!==0&&e.button!==1&&e.button!==2)return;
      const rect=canvas.getBoundingClientRect();
      const axes=window.pCubes?.getAxesInfo?.()||[];
      const x=e.clientX-rect.left,y=e.clientY-rect.top;
      const hit=e.button===0?this.pickFace(x,y):null;
      const pick=hit?this.pickLayer(x,y,axes):null;
      if(pick){canvas.dataset.pickedAxis=String(pick.axis);canvas.dataset.pickedLayer=String(pick.layer);}
      else{delete canvas.dataset.pickedAxis;delete canvas.dataset.pickedLayer;}
      const axis=pick&&axes.find(a=>a.index===pick.axis);
      this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,button:e.button,moved:false,pick,hit,axes,
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
      } else if(p.button===0&&p.hit&&p.before){
        // Resolve the turning axis and slice once per drag. Keep that exact
        // slice locked until pointerup so the gesture cannot jump layers.
        if(!p.dragTarget)
          p.dragTarget=this.pickLayerForDrag(p.hit,p.axes,e.clientX-p.downX,e.clientY-p.downY);
        const target=p.dragTarget;
        if(target){
          p.pick=target.pick;p.axis=target.axis;
          canvas.dataset.pickedAxis=String(p.pick.axis);canvas.dataset.pickedLayer=String(p.pick.layer);
          const step=Number(p.axis.angle)||Math.PI/2;
          p.previewAngle=target.drag/110*step*target.direction;
          this.previewTurn(p.before,p.axis,p.pick.layer,p.pick.normalSign||1,p.previewAngle);
        }
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

    // The Pascal model exports each face separately, but all faces belonging
    // to one physical cubie share the same Part index. Use that identity for
    // polyhedral puzzles: vertex-connectivity is not a safe proxy because
    // neighboring Megaminx pieces also meet at cut vertices.
    if (this.geometryKind === "minx") {
      const movingParts = new Set();
      for (let i = 0; i < faces.length; i++) {
        if (!selected[i]) continue;
        const face = faces[i], normal = this.faceNormal(face.vertices || []);
        if (!normal || this.dot(normal, n) * normalSign < .82) continue;
        const center = (face.vertices || []).reduce(
          (sum, v) => sum.map((x, k) => x + Number(v[k]) / face.vertices.length),
          [0, 0, 0]
        );
        if (Math.abs(this.dot(center, n) - selectedSurface) <= Math.max(1e-4, spacing * .08) &&
            Number.isInteger(face.partIndex))
          movingParts.add(face.partIndex);
      }
      if (movingParts.size)
        return faces.map(face => movingParts.has(face.partIndex));
    }
    return selected;
  }
  animateTurn(before, after, axis, angle, duration = 220, startAngle = 0, layer = 0, normalSign = 1) {
    if (!before?.faces || !after?.faces || !axis || !Number.isFinite(angle)) {
      this.setGeometry(after); return;
    }
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
  pickFace(x,y){
    for(let i=this.projectedFaces.length-1;i>=0;i--){
      const item=this.projectedFaces[i];
      if(item.screen.length>=3&&this.pointInPolygon(x,y,item.screen)){
        const normal=this.faceNormal(item.vertices);
        if(normal)return {item,normal,center:item.vertices.reduce((sum,v)=>sum.map((n,k)=>n+v[k]/item.vertices.length),[0,0,0])};
      }
    }
    return null;
  }
  pickLayerForDrag(hit,axes,dx,dy){
    const distance=Math.hypot(dx,dy);
    if(distance<4)return null;
    const cy=Math.cos(this.rotationY),sy=Math.sin(this.rotationY),cx=Math.cos(this.rotationX),sx=Math.sin(this.rotationX);
    // Convert the screen swipe into a direction in model space.
    const dragWorld=[dx*cy, -dy*cx, -dx*sy+dy*sx];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const desired=cross(hit.normal,dragWorld),desiredLength=Math.hypot(...desired);
    if(desiredLength<1e-8)return null;
    const direction=desired.map(v=>v/desiredLength);
    let chosen=null,best=0;
    for(const axis of axes||[]){
      const vector=[Number(axis.x),Number(axis.y),Number(axis.z)],length=Math.hypot(...vector);
      if(!length||!axis.layers)continue;
      const score=Math.abs(this.dot(direction,vector.map(v=>v/length)));
      if(score>best){best=score;chosen={axis,vector:vector.map(v=>v/length),sign:this.dot(direction,vector.map(v=>v/length))>=0?1:-1};}
    }
    if(!chosen||best<.8)return null;
    const values=[];
    for(const face of this.projectedFaces){
      const normal=this.faceNormal(face.vertices);
      if(!normal||Math.abs(this.dot(normal,chosen.vector))<.82)continue;
      const center=face.vertices.reduce((sum,v)=>sum.map((n,k)=>n+v[k]/face.vertices.length),[0,0,0]);
      const value=this.dot(center,chosen.vector);
      if(!values.some(old=>Math.abs(old-value)<1e-4))values.push(value);
    }
    values.sort((a,b)=>a-b);
    if(!values.length)return null;
    const coordinate=this.dot(hit.center,chosen.vector);
    let layer=0,bestDistance=Infinity;
    values.forEach((v,index)=>{const d=Math.abs(v-coordinate);if(d<bestDistance){bestDistance=d;layer=index;}});
    if(values.length!==chosen.axis.layers&&values.length>1)
      layer=Math.round(layer*(chosen.axis.layers-1)/(values.length-1));
    layer=Math.max(0,Math.min(chosen.axis.layers-1,layer));
    // Use the swipe's component perpendicular to the projected turning axis
    // as the signed drag distance for a natural direct-manipulation gesture.
    const a=chosen.vector;
    const projected=[a[0]*cy+a[2]*sy, -(a[1]*cx-(-a[0]*sy+a[2]*cy)*sx)];
    const plen=Math.hypot(...projected)||1;
    const perpendicular=[-projected[1]/plen,projected[0]/plen];
    const drag=dx*perpendicular[0]+dy*perpendicular[1];
    return {pick:{axis:chosen.axis.index,layer,normalSign:1},axis:chosen.axis,drag,direction:chosen.sign};
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
    const faces=this.geometry?.faces||[];
    // Compute the view bounds without flatMap/map intermediates. The old path
    // allocated several full-size arrays of vertex references and rotated
    // points on every redraw; large NxNxN puzzles made those spikes enormous.
    if(!faces.length){
      this.projectedFaces=[];
      ctx.textAlign="center";ctx.fillStyle="#e8edf5";ctx.font="600 18px system-ui";
      ctx.fillText("Load a pCubes puzzle XML",w/2,h/2-10);
      ctx.fillStyle="#9eacc0";ctx.font="13px system-ui";
      ctx.fillText("Left-drag a layer · right-drag to rotate camera · wheel to zoom",w/2,h/2+17);return;
    }
    const cy=Math.cos(this.rotationY),sy=Math.sin(this.rotationY),cx=Math.cos(this.rotationX),sx=Math.sin(this.rotationX);
    const transform=v=>{const x=v[0]*cy+v[2]*sy,z=-v[0]*sy+v[2]*cy;return[x,v[1]*cx-z*sx,v[1]*sx+z*cx];};
    // Use a rotation-invariant model-space bounding sphere. Recomputing the
    // projected AABB every frame makes the puzzle scale and center wobble as
    // its orientation changes (both during layer turns and camera drags).
    let radiusSquared=0,hasPoint=false;
    for(const face of faces){
      const vertices=face.vertices||[];
      for(let j=0;j<vertices.length;j++){
        const v=vertices[j],r2=v[0]*v[0]+v[1]*v[1]+v[2]*v[2];
        if(r2>radiusSquared)radiusSquared=r2;
        hasPoint=true;
      }
    }
    if(!hasPoint){this.projectedFaces=[];return;}
    const radius=Math.max(Math.sqrt(radiusSquared),1e-6);
    const scale=Math.min(w,h)*.68*this.zoom/(2*radius);
    const project=v=>[w/2+v[0]*scale,h/2-v[1]*scale];
    // Back-face culling: only submit polygons whose outward normal points
    // toward the camera. This is especially important for high-order puzzles
    // (e.g. 20x20x20), where drawing every hidden interior-facing polygon
    // wastes fill and stroke work and makes overlaps look muddy.
    const ordered=[];
    for(let index=0;index<faces.length;index++){
      const face=faces[index],vertices=face.vertices||[];
      if(vertices.length<3)continue;
      const viewVertices=vertices.map(transform);
      const normal=this.faceNormal(viewVertices);
      if(!normal||normal[2]<=1e-8)continue;
      const screen=viewVertices.map(project);
      let depth=0;
      for(let j=0;j<viewVertices.length;j++)depth+=viewVertices[j][2];
      ordered.push({vertices,screen,depth:depth/viewVertices.length,color:face.color});
    }
    ordered.sort((a,b)=>a.depth-b.depth);
    this.projectedFaces=ordered;
    for(const item of ordered){
      if(item.screen.length<3)continue;
      ctx.beginPath();for(let i=0;i<item.screen.length;i++){const [x,y]=item.screen[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      ctx.closePath();ctx.fillStyle=this.color(item.color);ctx.fill();ctx.strokeStyle="#101820";ctx.lineWidth=1.25;ctx.stroke();
    }
  }
  destroy(){this.resizeObserver.disconnect();}
}
