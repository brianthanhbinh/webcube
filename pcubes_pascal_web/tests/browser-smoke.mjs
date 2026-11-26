import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1365,height:900}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
try{
 await page.goto("http://127.0.0.1:4173/",{waitUntil:"networkidle"});
 await page.waitForFunction(()=>["passed","failed"].includes(document.documentElement.dataset.preflight),null,{timeout:120000});
 const pre=await page.evaluate(()=>({result:document.documentElement.dataset.preflight,status:document.querySelector("#engine-status")?.textContent||"",report:document.querySelector("#preflight-results")?.textContent||"",model:document.querySelector("#model-info")?.textContent||""}));
 assert.equal(pre.result,"passed","Preflight: "+pre.status+" | "+pre.report);assert.match(pre.model,/parts/);
 const canvas=page.locator("#puzzle-canvas");
 const pixels=await canvas.evaluate(c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>45||d[i+1]>45||d[i+2]>50)n++;return n;});assert.ok(pixels>100,"Canvas blank");
 const bounds=await canvas.boundingBox();assert.ok(bounds.height<=820&&bounds.height>=300,"Viewport sizing is out of bounds: "+bounds.height);
 const axes=await page.evaluate(()=>window.pCubes.getAxesInfo()),axis=axes.find(a=>a.layers>0)?.index;assert.notEqual(axis,undefined,"No turn axis");
 let before=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 assert.equal(await page.evaluate(a=>window.pCubes.turnLayer(a,0,1),axis),true);assert.notEqual(await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData())),before);
 // Left-drag turns a real visible cubie by following its projected arc.
 await page.locator("#turn-axis").selectOption(String(axis));await page.locator("#turn-layer").selectOption("0");
 before=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 const drag=await page.evaluate(()=>{
   const canvas=document.querySelector("#puzzle-canvas"),r=canvas.__pCubesRenderer;
   const axes=window.pCubes.getAxesInfo(),w=canvas.clientWidth,h=canvas.clientHeight;
   // Sample the canvas itself; polygon centroids can fall outside concave faces.
   for(let y=8;y<h-8;y+=5)for(let x=8;x<w-8;x+=5){
     const hit=r.pickFace(x,y);if(!hit)continue;
     for(const [dx,dy] of [[10,0],[-10,0],[0,10],[0,-10],[10,10],[-10,10],[10,-10],[-10,-10]]){
       const target=r.pickLayerForDrag(hit,axes,dx,dy);
       if(target)return {x,y,dx:target.screenTangent[0],dy:target.screenTangent[1]};
     }
   }
   return {debug:{faces:r.projectedFaces.length,parts:window.pCubes.getPartCenters().length,axes,first:r.projectedFaces[0]&&{partIndex:r.projectedFaces[0].partIndex,vertices:r.projectedFaces[0].vertices.slice(0,3)},firstHit:(()=>{for(let y=8;y<h-8;y+=5)for(let x=8;x<w-8;x+=5){const hit=r.pickFace(x,y);if(hit)return {partIndex:hit.partIndex,center:hit.center,normal:hit.normal};}return null;})()}};
 });
 assert.ok(drag?.x!==undefined,"Could not find a visible cubie with a valid drag tangent: "+JSON.stringify(drag?.debug));
 const endX=drag.x+drag.dx*.95,endY=drag.y+drag.dy*.95;
 await page.mouse.move(bounds.x+drag.x,bounds.y+drag.y);await page.mouse.down();await page.mouse.move(bounds.x+endX,bounds.y+endY,{steps:8});await page.mouse.up();
 assert.notEqual(await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData())),before,"Left-drag did not turn the layer under the pointer");
 const picked=await canvas.evaluate(c=>({axis:c.dataset.pickedAxis,layer:c.dataset.pickedLayer}));
 assert.ok(picked.axis!==undefined&&picked.layer!==undefined,"Pointer did not hit a visible cubie face");
 assert.equal(await page.locator("#turn-axis").inputValue(),picked.axis,"Drag did not use the axis under the pointer");
 assert.equal(await page.locator("#turn-layer").inputValue(),picked.layer,"Drag did not use the layer under the pointer");
 // Right-drag rotates the camera without changing puzzle geometry.
 before=await canvas.evaluate(c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.join(","));
 const geometryBeforeCamera=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down({button:"right"});await page.mouse.move(bounds.x+bounds.width/2+75,bounds.y+bounds.height/2+42,{steps:6});await page.mouse.up({button:"right"});
 assert.notEqual(await canvas.evaluate(c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.join(",")),before,"Right-drag did not rotate camera");
 assert.equal(await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData())),geometryBeforeCamera,"Right-drag unexpectedly turned puzzle layer");
 before=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 await page.locator("#scramble").click();await page.waitForTimeout(40);
 assert.notEqual(await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData())),before,"Scramble did not change puzzle geometry");
 assert.match(await page.locator("#engine-status").textContent(),/Scrambled: 30 random layer turns\./,"Scramble did not complete 30 random turns");
 assert.ok((await page.evaluate(()=>window.pCubes.getModelInfo().undoCount))>=30,"Scramble did not record the random turns");
 for(const id of ["undo","redo","reset"]){await page.locator("#"+id).click();await page.waitForTimeout(40);const s=await page.locator("#engine-status").textContent();assert.doesNotMatch(s,/Pascal error|failed/i,id+": "+s);assert.equal(await page.evaluate(()=>window.pCubes.isPuzzleReady()),true);}
 await page.locator("#library").click();await page.waitForFunction(()=>document.querySelector("#library-dialog")?.open);await page.waitForFunction(()=>document.querySelectorAll("#library-list button").length>0 || (document.querySelector("#library-list")?.textContent||"").startsWith("Library failed to load:"),null,{timeout:45000});
 const libraryLoadMessage=await page.locator("#library-list").textContent();assert.ok(await page.locator("#library-list button").count()>0,"Library did not populate: "+libraryLoadMessage);
 assert.ok(await page.locator("#library-list button").count()>=4);
 const cube2=page.locator("#library-list button").filter({has:page.locator("strong").getByText("Rubik's cube 2x2x2",{exact:true})});
 assert.equal(await cube2.count(),1,"2x2 exact entry missing/duplicated");assert.equal(await cube2.isEnabled(),true);await cube2.click();await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open);
 await page.locator("#library").click();await page.waitForFunction(()=>document.querySelector("#library-dialog")?.open);
 const cube3=page.locator("#library-list button").filter({has:page.locator("strong").getByText("Rubik's cube 3x3x3",{exact:true})});
 assert.equal(await cube3.count(),1,"3x3 exact entry missing/duplicated");assert.equal(await cube3.isEnabled(),true);await cube3.click();await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open);
 const model=await page.evaluate(()=>window.pCubes.getModelInfo());assert.match(model.name,/3x3x3/i);assert.ok(model.parts>=20,"Cubies not split: "+model.parts);
 const axes3=await page.evaluate(()=>window.pCubes.getAxesInfo());assert.ok(axes3.length>=3);
 // Repeated turns across different axes must recalculate cubie-to-layer membership.
 // Stale cached positions previously caused pieces to overlap and disappear.
 for(let turn=0;turn<60;turn++){
   const axis=axes3[turn%3];
   const moved=await page.evaluate(({axis,turn})=>window.pCubes.turnLayer(axis.index,turn%axis.layers,turn%2?1:-1),{axis,turn});
   assert.equal(moved,true,"Repeated move failed at turn "+turn);
 }
 const centers=await page.evaluate(()=>window.pCubes.getPartCenters());
 const centerKeys=centers.map(c=>c.map(v=>Math.round(v*100000)).join(","));
 assert.equal(centers.length,26,"A visible cubie disappeared after repeated turns");
 assert.equal(new Set(centerKeys).size,26,"Visible cubies overlapped after repeated turns");
 const allowed=[-1/3,0,1/3];
 for(const center of centers)for(const value of center)
   assert.ok(allowed.some(expected=>Math.abs(value-expected)<1e-5),"Cubie drifted off the 3x3 grid: "+center.join(","));
 const xml=await page.evaluate(async()=>{const {loadBuiltinLibrary}=await import("./library-data.js");const l=await loadBuiltinLibrary();return l.puzzles.find(p=>/2x2x2/i.test(p.name)).xml;});
 await page.locator("#puzzle-file").setInputFiles({name:"cube.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});await page.waitForFunction(()=>/Loaded /.test(document.querySelector("#engine-status")?.textContent||""));
 assert.equal(await page.evaluate(()=>window.pCubes.isPuzzleReady()),true);assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0));
 // Real library XML files can have an accidental Markdown citation after </xml>.
 await page.locator("#puzzle-file").setInputFiles({name:"cube-with-citation.xml",mimeType:"application/xml",buffer:Buffer.from(xml+"\n```[cite: 7]")});
 await page.waitForFunction(()=>/Loaded /.test(document.querySelector("#engine-status")?.textContent||""));
 assert.equal(await page.evaluate(()=>window.pCubes.isPuzzleReady()),true,"Trailing citation debris broke XML import");
 // A custom puzzle using an external Figure XML must keep its own figure,
 // rather than being silently replaced with the built-in 2x2 template.
 const customXml=xml.replaceAll("Rubik's cube 2x2x2","Custom cube with external figure").replaceAll("Figures\\Cube.xml","Figures\\CustomFigure.xml");
 await page.locator("#puzzle-file").setInputFiles({name:"custom-puzzle.xml",mimeType:"application/xml",buffer:Buffer.from(customXml)});
 await page.waitForFunction(()=>/Missing external figure/.test(document.querySelector("#engine-status")?.textContent||""));
 assert.equal(await page.locator("#add-figure").isEnabled(),true,"Add figure did not unlock for a missing external figure");
 const figureXml=`<?xml version="1.0"?><Figure><Part><Vertices>
 <Add Vector="-1; -1; -1"/><Add Vector="-1; -1; 1"/><Add Vector="-1; 1; -1"/><Add Vector="-1; 1; 1"/>
 <Add Vector="1; -1; -1"/><Add Vector="1; -1; 1"/><Add Vector="1; 1; -1"/><Add Vector="1; 1; 1"/>
 </Vertices><Faces>
 <Face Color="C80000" VertexIndexes="0;1;3;2"/><Face Color="FF800A" VertexIndexes="5;4;6;7"/>
 <Face Color="0000C8" VertexIndexes="1;0;4;5"/><Face Color="009600" VertexIndexes="2;3;7;6"/>
 <Face Color="FFFF00" VertexIndexes="0;2;6;4"/><Face Color="FFFFFF" VertexIndexes="3;1;5;7"/>
 </Faces></Part></Figure>`;
 const figureRoot=await fs.mkdtemp(path.join(os.tmpdir(),"pcubes-figure-folder-"));
 await fs.mkdir(path.join(figureRoot,"Figures"),{recursive:true});
 await fs.writeFile(path.join(figureRoot,"Figures","cube.xml"),figureXml);
 await fs.writeFile(path.join(figureRoot,"Library.xml"),"<xml><Puzzle><Name>Not a figure</Name></Puzzle></xml>");
 // Folder scan must recursively discover XML and preserve relative paths.
 await page.locator("#figure-folder").setInputFiles(figureRoot);
 await page.waitForFunction(()=>/Figure added/.test(document.querySelector("#engine-status")?.textContent||""));
 const customModel=await page.evaluate(()=>window.pCubes.getModelInfo());
 assert.equal(customModel.name,"Custom cube with external figure");
 assert.ok(customModel.parts>0,"Custom figure XML loaded no parts");
 assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0),"Attached custom figure did not render");
 // Official pCubes scripted Cube and Cuboid figures must be expanded to plain geometry.
 const scriptedPuzzle=customXml.replace("Custom cube with external figure","Scripted cube");
 const scriptedCubeXml=`<xml><Script>include 'Figures\\Scripts\\Cube_Coordinates.inc';</Script><Part>
 <Vertices Vectors="Vx; Vy; Vz"/><Faces>
 <Face Color="Colors[0]" VertexIndexes="0;1;3;2"/><Face Color="Colors[1]" VertexIndexes="5;4;6;7"/>
 <Face Color="Colors[2]" VertexIndexes="1;0;4;5"/><Face Color="Colors[3]" VertexIndexes="2;3;7;6"/>
 <Face Color="Colors[4]" VertexIndexes="0;2;6;4"/><Face Color="Colors[5]" VertexIndexes="3;1;5;7"/>
 </Faces></Part></xml>`;
 await page.locator("#puzzle-file").setInputFiles({name:"scripted-cube-puzzle.xml",mimeType:"application/xml",buffer:Buffer.from(scriptedPuzzle)});
 await page.waitForFunction(()=>/Missing external figure/.test(document.querySelector("#engine-status")?.textContent||""));
 await page.locator("#figure-file").setInputFiles({name:"Cube.xml",mimeType:"application/xml",buffer:Buffer.from(scriptedCubeXml)});
 await page.waitForFunction(()=>/Figure added/.test(document.querySelector("#engine-status")?.textContent||""));
 assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0),"Scripted Cube conversion did not render");
 const scriptedCuboidPuzzle=scriptedPuzzle.replace("Scripted cube","Scripted cuboid").replace('File="Figures\\CustomFigure.xml"','File="Figures\\CustomFigure.xml" Wx="0.5" Wy="0.25" Wz="0.75"');
 const scriptedCuboidXml=scriptedCubeXml.replace("Cube_Coordinates.inc","Cuboid_Coordinates.inc");
 await page.locator("#puzzle-file").setInputFiles({name:"scripted-cuboid-puzzle.xml",mimeType:"application/xml",buffer:Buffer.from(scriptedCuboidPuzzle)});
 await page.waitForFunction(()=>/Missing external figure/.test(document.querySelector("#engine-status")?.textContent||""));
 await page.locator("#figure-file").setInputFiles({name:"Cuboid.xml",mimeType:"application/xml",buffer:Buffer.from(scriptedCuboidXml)});
 await page.waitForFunction(()=>/Figure added/.test(document.querySelector("#engine-status")?.textContent||""));
 assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0),"Scripted Cuboid conversion did not render");
 const custom4=customXml
   .replace("Custom cube with external figure","Custom 4x4x4")
   .replace('PlaneDistances="-1/6;1/6"','PlaneDistances="-0.25;0;0.25"')
   .replace('PlaneDistances = "-1/6; 1/6"','PlaneDistances = "-0.25; 0; 0.25"');
 const custom4Doc=await page.evaluate(xmlText=>{
   const d=new DOMParser().parseFromString(xmlText,"application/xml");
   const axes=d.getElementsByTagName("Axes")[0];
   axes.setAttribute("PlaneDistances","-0.25; 0; 0.25");
   const load=d.getElementsByTagName("LoadFrom")[0];
   load.setAttribute("File","Figures\\Cube.xml");
   return new XMLSerializer().serializeToString(d);
 },custom4);
 await page.locator("#puzzle-file").setInputFiles({name:"custom-4x4.xml",mimeType:"application/xml",buffer:Buffer.from(custom4Doc)});
 await page.waitForFunction(()=>window.pCubes.getModelInfo().name==="Custom 4x4x4");
 const custom4Model=await page.evaluate(()=>window.pCubes.getModelInfo());
 assert.equal(custom4Model.parts,64,"Custom 4x4 XML cuts were overwritten instead of making 64 pieces");
 assert.deepEqual(errors,[],"Browser errors: "+errors.join(" | "));
 // Remote repository library entries keep their subdirectory labels and resolve figure XML automatically.
 await page.locator("#library").click();
 await page.waitForFunction(()=>document.querySelector("#library-dialog")?.open);
 await page.locator("#library-search").fill("cubes/cube_2x2x2.xml");
 const remoteCube=page.locator("#library-list button").filter({hasText:"webcube-library / cubes/cube_2x2x2.xml"});
 await remoteCube.waitFor({state:"visible"});
 await remoteCube.click();
 await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open);
 const remoteModel=await page.evaluate(()=>window.pCubes.getModelInfo());
 assert.match(remoteModel.name,/2x2x2 Cube/i);
 assert.ok(remoteModel.parts>=8,"Remote cube did not split into cubies: "+remoteModel.parts);
 assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0),"Remote library puzzle did not render");
 const remoteAxes=await page.evaluate(()=>window.pCubes.getAxesInfo());
 assert.equal(remoteAxes.length,3,"Remote cube must load all three axes");
 assert.deepEqual(remoteAxes.map(a=>[Math.round(a.x),Math.round(a.y),Math.round(a.z)]),[[1,0,0],[0,1,0],[0,0,1]],"NormVector attributes were not loaded for remote axes");
 // Exercise every official remote puzzle, not just the two small cube fixtures.
 const catalog=await page.evaluate(async()=>{const m=await import("./remote-library.js");return await m.loadRemoteLibraryIndex();});
 const remoteFailures=[];
 for(const entry of catalog.puzzles){
   if(!await page.locator("#library-dialog").evaluate(d=>d.open)){
     await page.locator("#library").click();
     await page.waitForFunction(()=>document.querySelector("#library-dialog")?.open);
   }
   await page.locator("#library-search").fill(entry.path);
   const item=page.locator("#library-list button").filter({hasText:"webcube-library / "+entry.path});
   try{
     await item.waitFor({state:"visible",timeout:10000});
     await item.click();
     await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open || (document.querySelector("#engine-status")?.textContent||"").startsWith("Library load failed"),null,{timeout:30000});
     const failed=await page.locator("#library-dialog").evaluate(d=>d.open);
     if(failed) {
       remoteFailures.push({path:entry.path,error:await page.locator("#engine-status").textContent()});
       await page.locator("#library-close").click();
       await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open);
     }
   }catch(error){
     remoteFailures.push({path:entry.path,error:String(error).slice(0,300)});
     if(await page.locator("#library-dialog").evaluate(d=>d.open)){
       await page.locator("#library-close").click();
       await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open);
     }
   }
 }
 console.log("REMOTE_CATALOG_SCAN "+JSON.stringify({total:catalog.puzzles.length,failures:remoteFailures}));
 assert.deepEqual(remoteFailures,[],"Remote library XML failures: "+JSON.stringify(remoteFailures));
 // Megaminx regression: verify its external dodecahedron figure, all six
 // cutting axes, and all twelve independently defined face colours.
 await page.locator("#library").click();
 await page.waitForFunction(()=>document.querySelector("#library-dialog")?.open);
 await page.locator("#library-search").fill("docminx/Megaminx 3x3.xml");
 const megaminxEntry=page.locator("#library-list button").filter({hasText:"webcube-library / docminx/Megaminx 3x3.xml"});
 await megaminxEntry.waitFor({state:"visible"});
 await megaminxEntry.click();
 await page.waitForFunction(()=>!document.querySelector("#library-dialog")?.open || (document.querySelector("#engine-status")?.textContent||"").startsWith("Library load failed"),null,{timeout:30000});
 assert.equal(await page.locator("#library-dialog").evaluate(d=>d.open),false,"Megaminx failed to load: "+await page.locator("#engine-status").textContent());
 const megaminx=await page.evaluate(()=>({
   model:window.pCubes.getModelInfo(),
   axes:window.pCubes.getAxesInfo(),
   faces:window.pCubes.getRenderData().faces
 }));
 assert.match(megaminx.model.name,/Megaminx 3x3/i,"Wrong puzzle loaded instead of Megaminx");
 assert.ok(megaminx.model.parts>=12,"Megaminx dodecahedron did not split into its expected pieces: "+megaminx.model.parts);
 assert.equal(megaminx.axes.length,6,"Megaminx must expose all six dodecahedral turning axes");
 assert.ok(megaminx.axes.every(axis=>axis.fixedLayers?.length===3&&axis.fixedLayers[1]===true&&Math.abs(Number(axis.angles?.[1]||0))<1e-7),"Megaminx core layer must be fixed with zero angle on every axis: "+JSON.stringify(megaminx.axes));
 const coreUndo=await page.evaluate(()=>window.pCubes.getModelInfo().undoCount);
 assert.equal(await page.evaluate(axis=>window.pCubes.turnLayer(axis,1,1),megaminx.axes[0].index),false,"Megaminx core layer must reject turns");
 assert.equal(await page.evaluate(()=>window.pCubes.getModelInfo().undoCount),coreUndo,"Rejected core turn must not enter undo history");
 assert.ok(megaminx.faces.length>=60,"Megaminx is missing rendered pentagonal face geometry: "+megaminx.faces.length);
 assert.ok(new Set(megaminx.faces.map(face=>String(face.color).toLowerCase())).size>=12,"Megaminx must preserve all twelve face colours");
 await page.locator("#turn-axis").selectOption("0");
 await page.locator("#turn-layer").selectOption("2");
 assert.equal(await page.locator("#turn-cw").textContent(),"Turn +72°","Megaminx turn button shows the wrong angle");
 assert.equal(await page.locator("#turn-half-cw").textContent(),"Turn +144°","Megaminx half-turn button shows the wrong angle");
 const minxBefore=JSON.stringify(await page.evaluate(()=>window.pCubes.getRenderData()));
 await page.locator("#turn-cw").click();
 assert.notEqual(JSON.stringify(await page.evaluate(()=>window.pCubes.getRenderData())),minxBefore,"Megaminx turn button did not change the puzzle");
 const undoBeforeHalf=await page.evaluate(()=>window.pCubes.getModelInfo().undoCount);
 await page.locator("#turn-half-cw").click();
 assert.equal(await page.evaluate(()=>window.pCubes.getModelInfo().undoCount),undoBeforeHalf+2,"Megaminx half-turn must record two 72-degree turns");
 await page.evaluate(()=>window.pCubes.reset());
 await page.waitForFunction(()=>window.pCubes.getModelInfo().undoCount===0);
 // Cube generator must accept orders above the former arbitrary cap.
 const largeCube=await page.evaluate(async()=>{const m=await import("./generator.js");return await m.generatePuzzle("cube","26");});
 assert.match(largeCube.name,/26x26x26 Cube/,"Cube generator still caps orders at 25");
 assert.ok(largeCube.xml.includes("<Name>26x26x26 Cube</Name>"),"Large cube XML was not generated correctly");
 const customGeneratorResult=await page.evaluate(async()=>{
   const module=await import("./generator.js");
   const source="def generate(spec):"+String.fromCharCode(10)+"    return "+JSON.stringify({name:"Custom Python test",xml:"<xml/>",figures:{}});
   const saved=await module.saveCustomGenerator({name:"smoke-test.figure",text:async()=>source});
   const listed=await module.listCustomGenerators();
   const generated=await module.generateCustomPuzzle(saved.id,"4");
   await module.deleteCustomGenerator(saved.id);
   const afterDelete=await module.listCustomGenerators();
   return {saved,listed,generated,afterDelete};
 });
 assert.ok(customGeneratorResult.listed.some(item=>item.id===customGeneratorResult.saved.id),"Uploaded .figure generator was not saved locally");
 assert.equal(customGeneratorResult.generated.name,"Custom Python test","Custom Python generator did not execute");
 assert.equal(customGeneratorResult.generated.xml,"<xml/>","Custom Python generator returned the wrong XML");
 assert.ok(!customGeneratorResult.afterDelete.some(item=>item.id===customGeneratorResult.saved.id),"Deleted .figure generator remains in local storage");
 assert.ok(megaminx.axes.every(axis=>Array.isArray(axis.angles)&&axis.angles.length===axis.layers),
   "Megaminx axes must expose an exact turning angle for every layer");
 for(const axis of megaminx.axes){
   const layer=axis.angles.findIndex(angle=>Number.isFinite(Number(angle))&&Math.abs(Number(angle))>1e-6);
   assert.ok(layer>=0,"Megaminx axis "+axis.index+" has no movable layer angle");
   const before=JSON.stringify(await page.evaluate(()=>window.pCubes.getRenderData()));
   const turned=await page.evaluate(({axisNo,layerNo})=>window.pCubes.turnLayer(axisNo,layerNo,1),{axisNo:axis.index,layerNo:layer});
   assert.equal(turned,true,"Megaminx axis "+axis.index+" layer "+layer+" did not turn");
   const after=JSON.stringify(await page.evaluate(()=>window.pCubes.getRenderData()));
   assert.notEqual(after,before,"Megaminx axis "+axis.index+" did not change geometry");
   await page.evaluate(()=>window.pCubes.undo());
 }
 console.log("PASS: Megaminx dodecahedron, six axes, twelve colours, and per-layer turning.");
 // Generator UI is available after the Pascal startup self-test.
 await page.locator("#generator").click();
 await page.waitForFunction(()=>document.querySelector("#generator-dialog")?.open);
 assert.equal(await page.locator("#generator-type option").count(),7,"Not all generator families are offered");
 await page.locator("#generator-close").click();
 console.log("PASS: Remote repository library integration and generator UI.");
 // Returning to the app must restore the most recently loaded puzzle, not the startup test cube.
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.dataset.preflight==="passed" && /Megaminx 3x3/i.test(window.pCubes?.getModelInfo?.().name||""),null,{timeout:45000});
 assert.match(await page.locator("#engine-status").textContent(),/Restored last puzzle:.*Megaminx/i,"Last successfully loaded puzzle was not restored after reload");
 console.log("PASS: last successfully loaded puzzle is restored after reload.");
 console.log("PASS: preflight, render, drag, scramble, undo/redo/reset, local and remote library, generator UI, XML upload.");
}finally{await browser.close();}
