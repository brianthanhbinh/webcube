import { chromium } from "playwright";
import assert from "node:assert/strict";
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
 // Left-drag turns the selected layer without clicking turn buttons.
 await page.locator("#turn-axis").selectOption(String(axis));await page.locator("#turn-layer").selectOption("0");
 before=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+65,bounds.y+bounds.height/2,{steps:5});await page.mouse.up();
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
 await page.locator("#library").click();await page.waitForFunction(()=>document.querySelector("#library-dialog")?.open);await page.waitForFunction(()=>document.querySelectorAll("#library-list button").length>0);
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
 assert.equal(centers.length,27,"A cubie disappeared after repeated turns");
 assert.equal(new Set(centerKeys).size,27,"Cubies overlapped after repeated turns");
 const allowed=[-1/3,0,1/3];
 for(const center of centers)for(const value of center)
   assert.ok(allowed.some(expected=>Math.abs(value-expected)<1e-5),"Cubie drifted off the 3x3 grid: "+center.join(","));
 const xml=await page.evaluate(async()=>{const {loadBuiltinLibrary}=await import("./library-data.js");const l=await loadBuiltinLibrary();return l.puzzles.find(p=>/2x2x2/i.test(p.name)).xml;});
 await page.locator("#puzzle-file").setInputFiles({name:"cube.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});await page.waitForFunction(()=>/Loaded /.test(document.querySelector("#engine-status")?.textContent||""));
 assert.equal(await page.evaluate(()=>window.pCubes.isPuzzleReady()),true);assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0));
 // A custom puzzle using an external Figure XML must keep its own figure,
 // rather than being silently replaced with the built-in 2x2 template.
 const customXml=xml.replace(/Rubik's cube 2x2x2/g,"Custom cube with external figure");
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
 await page.locator("#figure-file").setInputFiles({name:"cube.xml",mimeType:"application/xml",buffer:Buffer.from(figureXml)});
 await page.waitForFunction(()=>/Figure added/.test(document.querySelector("#engine-status")?.textContent||""));
 const customModel=await page.evaluate(()=>window.pCubes.getModelInfo());
 assert.equal(customModel.name,"Custom cube with external figure");
 assert.equal(customModel.parts,1,"Custom figure was replaced by the default 2x2 cubies");
 assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0),"Attached custom figure did not render");
 assert.deepEqual(errors,[],"Browser errors: "+errors.join(" | "));
 console.log("PASS: preflight, render, compact viewport, left-drag layer turn, right-drag camera rotation, scramble geometry, undo/redo/reset, exact 2x2/3x3 selection, XML upload.");
}finally{await browser.close();}
