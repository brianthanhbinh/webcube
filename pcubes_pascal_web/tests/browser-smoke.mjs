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
  assert.equal(preflight.result, "passed", "Startup self-test failed:\n" + preflight.status + "\n" + preflight.report);
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

  assert.deepEqual(pageErrors, [], "Browser runtime errors:\n" + pageErrors.join("\n"));
  console.log("PASS: startup preflight, 4-item library, canvas rendering, scramble/undo/redo/reset, XML file upload, and no browser exceptions.");
} finally {
  await browser.close();
}
