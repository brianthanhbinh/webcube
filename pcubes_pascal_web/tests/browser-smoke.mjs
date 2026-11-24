import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => ["passed", "failed"].includes(document.documentElement.dataset.preflight),
    null,
    { timeout: 120000 }
  );

  const preflight = await page.evaluate(() => ({
    result: document.documentElement.dataset.preflight,
    status: document.querySelector("#engine-status")?.textContent || "",
    report: document.querySelector("#preflight-results")?.textContent || "",
    model: document.querySelector("#model-info")?.textContent || ""
  }));
  assert.equal(preflight.result, "passed", "Startup self-test failed: " + preflight.status + " | " + preflight.report);
  assert.match(preflight.status, /All \d+ startup tests passed/);
  assert.match(preflight.model, /parts/);

  const paintedPixels = await page.locator("#puzzle-canvas").evaluate(canvas => {
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 45 || data[i + 1] > 45 || data[i + 2] > 50) colored++;
    }
    return colored;
  });
  assert.ok(paintedPixels > 100, "Canvas appears blank (" + paintedPixels + " colored pixels)");

  const axes = await page.evaluate(() => window.pCubes.getAxesInfo());
  assert.ok(axes.length > 0 && axes.some(axis => axis.layers > 0), "No layer-turn axes exported");
  const axisIndex = axes.findIndex(axis => axis.layers > 0);
  const beforeTurn = await page.evaluate(() => JSON.stringify(window.pCubes.getRenderData()));
  assert.equal(await page.evaluate(({axis}) => window.pCubes.turnLayer(axis,0,1), {axis:axisIndex}), true, "Manual turn API failed");
  const afterTurn = await page.evaluate(() => JSON.stringify(window.pCubes.getRenderData()));
  assert.notEqual(afterTurn,beforeTurn,"Manual turn did not change geometry");
  const canvas = page.locator("#puzzle-canvas");
  const beforeCamera = await canvas.evaluate(el => el.getContext("2d").getImageData(0,0,el.width,el.height).data.join(","));
  await canvas.hover({position:{x:300,y:200}}); await page.mouse.down({button:"right"}); await page.mouse.move(350,240,{steps:4}); await page.mouse.up({button:"right"});
  const afterCamera = await canvas.evaluate(el => el.getContext("2d").getImageData(0,0,el.width,el.height).data.join(","));
  assert.notEqual(afterCamera,beforeCamera,"Drag did not rotate camera");

  for (const id of ["scramble", "undo", "redo", "reset"]) {
    await page.locator("#" + id).click();
    await page.waitForTimeout(30);
    const status = await page.locator("#engine-status").textContent();
    assert.doesNotMatch(status, /Pascal error|failed/i, id + " failed: " + status);
    const ready = await page.evaluate(() => window.pCubes?.isPuzzleReady());
    assert.equal(ready, true, id + " left the puzzle unavailable");
  }

  await page.locator("#library").click();
  await page.waitForFunction(() => document.querySelector("#library-dialog")?.open === true);
  await page.waitForFunction(() => document.querySelectorAll("#library-list button").length > 0);
  const libraryCount = await page.locator("#library-list button").count();
  assert.equal(libraryCount, 4, "Expected 4 catalog puzzles, found " + libraryCount);
  const cubeButton = page.locator("#library-list button").filter({ hasText: "Rubik's cube 2x2x2" });
  assert.equal(await cubeButton.isEnabled(), true);
  await cubeButton.click();
  await page.waitForFunction(() => document.querySelector("#library-dialog")?.open === false);
  assert.equal(await page.evaluate(() => window.pCubes.isPuzzleReady()), true);
  await page.locator("#library").click();
  await page.waitForFunction(() => document.querySelector("#library-dialog")?.open === true);
  const three = page.locator("#library-list button").filter({hasText:"3x3x3"});
  assert.equal(await three.count(),1,"3x3x3 entry missing");
  assert.equal(await three.isEnabled(),true,"3x3x3 entry is disabled");
  await three.click();
  await page.waitForFunction(() => document.querySelector("#library-dialog")?.open === false);
  const loadedName = await page.evaluate(() => window.pCubes.getModelInfo().name);
  assert.match(loadedName,/3x3x3/i,"3x3x3 selection left old puzzle loaded: "+loadedName);
  const threeModel = await page.evaluate(() => window.pCubes.getModelInfo());
  assert.ok(threeModel.parts >= 20, "3x3x3 did not split into cubies; only "+threeModel.parts+" part(s) loaded");
  const threeAxes = await page.evaluate(() => window.pCubes.getAxesInfo());
  assert.ok(threeAxes.length >= 3, "3x3x3 axes were not loaded");
  const beforeThreeTurn = await page.evaluate(() => JSON.stringify(window.pCubes.getRenderData()));
  const threeAxis = threeAxes.findIndex(a => a.enabled);
  assert.equal(await page.evaluate(({axis}) => window.pCubes.turnLayer(axis,0,1),{axis:threeAxis}),true,"3x3x3 manual layer turn failed");
  assert.notEqual(await page.evaluate(() => JSON.stringify(window.pCubes.getRenderData())),beforeThreeTurn,"3x3x3 turn did not change geometry");

  const xml = await page.evaluate(async () => {
    const { loadBuiltinLibrary } = await import("./library-data.js");
    const library = await loadBuiltinLibrary();
    return library.puzzles.find(item => /2x2x2/i.test(item.name)).xml;
  });
  await page.locator("#puzzle-file").setInputFiles({
    name: "2x2x2.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(xml, "utf8")
  });
  await page.waitForFunction(() => /Loaded /.test(document.querySelector("#engine-status")?.textContent || ""));
  assert.equal(await page.evaluate(() => window.pCubes.isPuzzleReady()), true);
  assert.ok(await page.evaluate(() => window.pCubes.getRenderData().faces.length > 0));

  assert.deepEqual(pageErrors, [], "Browser runtime errors:
" + pageErrors.join("
"));
  console.log("PASS: startup preflight, 4-item library, canvas rendering, scramble/undo/redo/reset, XML file upload, and no browser exceptions.");
} finally {
  await browser.close();
}
