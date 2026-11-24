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
 // Primary gesture: left-drag freely spins the whole puzzle.
 before=await canvas.evaluate(c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.join(","));
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+75,bounds.y+bounds.height/2+42,{steps:6});await page.mouse.up();
 assert.notEqual(await canvas.evaluate(c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.join(",")),before,"Left-drag did not spin the puzzle");
 // Right-drag turns the selected layer without clicking turn buttons.
 await page.locator("#turn-axis").selectOption(String(axis));await page.locator("#turn-layer").selectOption("0");
 before=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down({button:"right"});await page.mouse.move(bounds.x+bounds.width/2+65,bounds.y+bounds.height/2,{steps:5});await page.mouse.up({button:"right"});
 assert.notEqual(await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData())),before,"Right-drag did not turn selected layer");
 before=await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData()));
 await page.locator("#scramble").click();await page.waitForTimeout(40);
 assert.notEqual(await page.evaluate(()=>JSON.stringify(window.pCubes.getRenderData())),before,"Scramble did not change puzzle geometry");
 assert.match(await page.locator("#engine-status").textContent(),/Scrambled:/,"Scramble status missing");
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
 const xml=await page.evaluate(async()=>{const {loadBuiltinLibrary}=await import("./library-data.js");const l=await loadBuiltinLibrary();return l.puzzles.find(p=>/2x2x2/i.test(p.name)).xml;});
 await page.locator("#puzzle-file").setInputFiles({name:"cube.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});await page.waitForFunction(()=>/Loaded /.test(document.querySelector("#engine-status")?.textContent||""));
 assert.equal(await page.evaluate(()=>window.pCubes.isPuzzleReady()),true);assert.ok(await page.evaluate(()=>window.pCubes.getRenderData().faces.length>0));
 assert.deepEqual(errors,[],"Browser errors: "+errors.join(" | "));
 console.log("PASS: preflight, render, compact viewport, left-drag spin, right-drag layer turn, scramble geometry, undo/redo/reset, exact 2x2/3x3 selection, XML upload.");
}finally{await browser.close();}
