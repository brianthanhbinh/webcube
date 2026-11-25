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
    this.highlightMask=null;
    this.selectedMask=null;
    this.hoverMask=null;
    this.onTurnDrag=null;
    this.onTurnCommit=null;
    this.cameraSnapEnabled=false;
    canvas.style.touchAction="none";
    canvas.addEventListener("contextmenu",e=>e.preventDefault());
    canvas.addEventListener("auxclick",e=>e.preventDefault());
    canvas.addEventListener("pointerdown",e=>{
      if(this.interactive===false)return;
      // Middle-click is a camera gesture, never a face/layer selection.
      if(e.button===1)e.preventDefault();
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
      this.highlightMask=pick&&axis?this.layerFaceMask(this.geometry,axis,pick.layer,pick.normalSign||1):null;
      this.draw();
      this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,button:e.button,moved:false,pick,hit,axes,
        before:pick?this.geometry:null,axis,previewAngle:0};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove",e=>{
      const p=this.pointer;
      if(!p){
        if(this.interactive===false)return;
        // Do not run hover picking while any mouse button is held. This also
        // prevents a lost middle-button pointer capture from painting a face
        // highlight during a camera drag.
        if(e.buttons!==0){this.highlightMask=null;return;}
        const rect=canvas.getBoundingClientRect();
        const x=e.clientX-rect.left,y=e.clientY-rect.top;
        const hit=this.pickFace(x,y);
        const axes=window.pCubes?.getAxesInfo?.()||[];
        const pick=hit?this.pickLayer(x,y,axes):null;
        const axis=pick&&axes.find(a=>a.index===pick.axis);
        const nextMask=pick&&axis?this.layerFaceMask(this.geometry,axis,pick.layer,pick.normalSign||1):null;
        if(JSON.stringify(nextMask)!==JSON.stringify(this.hoverMask)){
          this.hoverMask=nextMask;
          this.highlightMask=this.hoverMask||this.selectedMask;
          this.draw();
        }
        return;
      }
      if(p.id!==e.pointerId)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(Math.abs(e.clientX-p.downX)+Math.abs(e.clientY-p.downY)>4)p.moved=true;
      if(p.button===2||p.button===1){
        this.rotationY+=dx*.009;
        this.rotationX=Math.max(-1.52,Math.min(1.52,this.rotationX+dy*.009));
        this.draw();
      } else if(p.button===0&&!p.hit){
        // A left drag that starts on empty canvas rotates the camera.
        this.rotationY+=dx*.009;
        this.rotationX=Math.max(-1.52,Math.min(1.52,this.rotationX+dy*.009));
        this.draw();
      } else if(p.button===0&&p.hit&&p.before){
        // Resolve the turning axis and slice once per drag. Keep that exact
        // slice locked until pointerup so the gesture cannot jump layers.
        const dx0=e.clientX-p.downX,dy0=e.clientY-p.downY;
        if(!p.dragTarget){
          p.dragTarget=this.pickLayerForDrag(p.hit,p.axes,dx0,dy0);
          // No face-swipe fallback: turns require a grabbed piece moving
          // along its projected circular path around the selected axis.
        }
        const target=p.dragTarget;
        if(target){
          // Keep the layer fixed, but continuously measure the full drag
          // distance from pointerdown so the preview follows the pointer.
          // screenTangent is measured in pixels per radian, matching the
          // actual canvas projection. Using model-space units here made a
          // tiny mouse movement produce a huge angle, then hit the clamp.
          const tangent=target.screenTangent;
          const tangentLengthSquared=tangent[0]*tangent[0]+tangent[1]*tangent[1];
          p.pick=target.pick;p.axis=target.axis;
          canvas.dataset.pickedAxis=String(p.pick.axis);canvas.dataset.pickedLayer=String(p.pick.layer);
          const step=Number(p.axis.angle)||Math.PI/2;
          p.previewAngle=tangentLengthSquared>1e-8
            ? (dx0*tangent[0]+dy0*tangent[1])/tangentLengthSquared
            : 0;
          p.previewAngle=Math.max(-step*1.25,Math.min(step*1.25,p.previewAngle));
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
      this.hoverMask=null;
      this.highlightMask=this.selectedMask;
      this.draw();
    });
    const clearPointer=()=>{this.pointer=null;this.hoverMask=null;this.highlightMask=this.selectedMask;this.draw();};
    canvas.addEventListener("pointerleave",()=>{
      if(!this.pointer&&this.hoverMask){this.hoverMask=null;this.highlightMask=this.selectedMask;this.draw();}
    });
    canvas.addEventListener("pointercancel",clearPointer);
    canvas.addEventListener("lostpointercapture",clearPointer);
    canvas.addEventListener("wheel",e=>{
      e.preventDefault();
      if(this.interactive===false)return;
      this.zoom=Math.max(.35,Math.min(4,this.zoom*Math.exp(-e.deltaY*.001)));
      this.draw();
    },{passive:false});
    canvas.addEventListener("dblclick",()=>{if(this.interactive!==false)this.resetView();});
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }
  layerFaceMask(geometry, axis, layer, normalSign = 1) {
    const faces=geometry?.faces||[];
    const vector=[Number(axis?.x),Number(axis?.y),Number(axis?.z)];
    const length=Math.hypot(...vector);
    const count=Math.max(1,Number(axis?.layers)||1);
    if(!length||!faces.length)return [];
    const n=vector.map(v=>v/length);
    let min=Infinity,max=-Infinity;
    for(const face of faces)for(const v of face.vertices||[]){
      const value=this.dot(v,n);
      if(value<min)min=value;
      if(value>max)max=value;
    }
    const pitch=(max-min)/count;
    if(!(pitch>1e-7))return faces.map(()=>true);
    const index=Math.max(0,Math.min(count-1,Math.round(Number(layer)||0)));
    const center=min+(index+.5)*pitch;
    const eps=pitch*.08;
    return faces.map(face=>{
      const vertices=face.vertices||[];
      if(!vertices.length)return false;
      const faceCenter=vertices.reduce((sum,v)=>sum.map((x,k)=>x+Number(v[k])/vertices.length),[0,0,0]);
      const projection=this.dot(faceCenter,n);
      const normal=this.faceNormal(vertices);
      const along=normal?this.dot(normal,n):0;
      // The outside sticker polygon sits on the boundary, not at the cubie
      // center. Include it only for the outermost slice on that side.
      const onPositiveBoundary=index===count-1&&along*normalSign>.82&&
        Math.abs(projection-max)<eps;
      const onNegativeBoundary=index===0&&along*normalSign>.82&&
        Math.abs(projection-min)<eps;
      return onPositiveBoundary||onNegativeBoundary||Math.abs(projection-center)<=pitch*.55;
    });
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
  setGeometry(geometry){this.geometry=geometry&&Array.isArray(geometry.faces)?geometry:null;if(this.selectedAxisIndex!==undefined)this.setSelectedLayer(this.selectedAxisIndex,this.selectedLayerIndex);else this.draw();}
  setSelectedLayer(axisIndex,layerIndex){
    this.selectedAxisIndex=Number(axisIndex);
    this.selectedLayerIndex=Number(layerIndex)||0;
    const axes=window.pCubes?.getAxesInfo?.()||[];
    const axis=axes.find(a=>Number(a.index)===Number(axisIndex));
    this.selectedMask=axis?this.layerFaceMask(this.geometry,axis,this.selectedLayerIndex,1):null;
    this.highlightMask=this.hoverMask||this.selectedMask;
    this.draw();
  }
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
        if(normal)return {item,normal,partIndex:item.partIndex,center:item.vertices.reduce((sum,v)=>sum.map((n,k)=>n+v[k]/item.vertices.length),[0,0,0])};
      }
    }
    return null;
  }
  pickLayerForDrag(hit,axes,dx,dy){
    const distance=Math.hypot(dx,dy);
    if(distance<2)return null;
    const partCenters=window.pCubes?.getPartCenters?.()||[];
    // Some Pascal geometry exports omit face.partIndex. Recover the grabbed
    // cubie from the picked face center instead of silently disabling turns.
    let center=Number.isInteger(hit?.partIndex)?partCenters[hit.partIndex]:null;
    if(!center&&hit?.center&&partCenters.length){
      let nearest=Infinity;
      for(const candidate of partCenters){
        if(!Array.isArray(candidate)||candidate.length<3)continue;
        const distance=Math.hypot(candidate[0]-hit.center[0],candidate[1]-hit.center[1],candidate[2]-hit.center[2]);
        if(distance<nearest){nearest=distance;center=candidate;}
      }
    }
    if(!center)return null;
    const cy=Math.cos(this.rotationY),sy=Math.sin(this.rotationY);
    const cx=Math.cos(this.rotationX),sx=Math.sin(this.rotationX);
    // A grabbed cubie moves along an arc around the puzzle axis. Compare the
    // pointer motion with each candidate cubie's projected tangent, rather
    // than deriving a turn from a swipe across the sticker face.
    const projectVector=v=>{
      const x=v[0]*cy+v[2]*sy;
      const z=-v[0]*sy+v[2]*cy;
      const y=v[1]*cx-z*sx;
      return [x,-y];
    };
    const swipe=[dx,dy],swipeLength=Math.hypot(dx,dy);
    let chosen=null,best=0;
    for(const axis of axes||[]){
      const raw=[Number(axis.x),Number(axis.y),Number(axis.z)];
      const length=Math.hypot(...raw);
      if(!length||!axis.layers)continue;
      const a=raw.map(v=>v/length);
      const axial=this.dot(center,a);
      const radial=center.map((v,k)=>v-a[k]*axial);
      const radius=Math.hypot(...radial);
      if(radius<1e-7)continue;
      const tangent=[
        a[1]*radial[2]-a[2]*radial[1],
        a[2]*radial[0]-a[0]*radial[2],
        a[0]*radial[1]-a[1]*radial[0]
      ];
      const modelTangent=projectVector(tangent);
      // Convert the projected model-space derivative to screen pixels.
      const screenTangent=[modelTangent[0]*(this.renderScale||1),modelTangent[1]*(this.renderScale||1)];
      const tangentLength=Math.hypot(...screenTangent);
      if(tangentLength<1e-5)continue;
      const alignment=Math.abs((swipe[0]*screenTangent[0]+swipe[1]*screenTangent[1])/(swipeLength*tangentLength));
      if(alignment>best){
        best=alignment;
        chosen={axis,vector:a,screenTangent,radialCoordinate:axial};
      }
    }
    // Avoid guessing a turn when the drag is not following an edge/cubie's
    // natural arc. The user can reposition and make a clearer tangential drag.
    if(!chosen||best<.28)return null;
    const positions=[];
    for(const part of partCenters){
      const value=this.dot(part,chosen.vector);
      if(!positions.some(old=>Math.abs(old-value)<1e-4))positions.push(value);
    }
    positions.sort((a,b)=>a-b);
    const count=Math.max(1,Number(chosen.axis.layers)||1);
    let nearest=0,nearestDistance=Infinity;
    positions.forEach((value,index)=>{
      const d=Math.abs(value-chosen.radialCoordinate);
      if(d<nearestDistance){nearestDistance=d;nearest=index;}
    });
    const layer=positions.length>1
      ? Math.max(0,Math.min(count-1,Math.round(nearest*(count-1)/(positions.length-1))))
      : 0;
    return {
      pick:{axis:chosen.axis.index,layer,normalSign:1},
      axis:chosen.axis,
      screenTangent:chosen.screenTangent
    };
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
      // Select by the clicked part's center, not its outer sticker face.
      // This distinguishes inner cubies on arbitrary puzzle geometries.
      const partCenters=window.pCubes?.getPartCenters?.()||[];
      const partCenter=Number.isInteger(item.partIndex)?partCenters[item.partIndex]:null;
      const coordinate=partCenter
        ? this.dot(partCenter,chosen.vector)
        : this.dot(item.vertices.reduce((sum,v)=>sum.map((n,k)=>n+v[k]/item.vertices.length),[0,0,0]),chosen.vector);
      const positions=[];
      for(const center of partCenters){
        const value=this.dot(center,chosen.vector);
        if(!positions.some(old=>Math.abs(old-value)<1e-4))positions.push(value);
      }
      positions.sort((a,b)=>a-b);
      const count=Math.max(1,Number(chosen.layers)||1);
      let nearest=0,nearestDistance=Infinity;
      positions.forEach((value,index)=>{
        const distance=Math.abs(value-coordinate);
        if(distance<nearestDistance){nearestDistance=distance;nearest=index;}
      });
      const layer=positions.length>1
        ? Math.max(0,Math.min(count-1,Math.round(nearest*(count-1)/(positions.length-1))))
        : 0;
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
    this.renderScale=scale;
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
      ordered.push({vertices,screen,depth:depth/viewVertices.length,color:face.color,partIndex:face.partIndex,highlighted:Boolean(this.highlightMask?.[index])});
    }
    ordered.sort((a,b)=>a.depth-b.depth);
    this.projectedFaces=ordered;
    for(const item of ordered){
      if(item.screen.length<3)continue;
      ctx.beginPath();for(let i=0;i<item.screen.length;i++){const [x,y]=item.screen[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      ctx.closePath();ctx.fillStyle=this.color(item.color);ctx.fill();
       if(item.highlighted){ctx.fillStyle="rgba(80,220,255,0.38)";ctx.fill();ctx.strokeStyle="#7DEBFF";ctx.lineWidth=2.5;ctx.stroke();}
       else{ctx.strokeStyle="#101820";ctx.lineWidth=1.25;ctx.stroke();}
    }
  }
  destroy(){this.resizeObserver.disconnect();}
}
