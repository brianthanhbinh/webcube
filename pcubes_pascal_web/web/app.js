import { PuzzleRenderer } from "./renderer.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const status = $("engine-status");
  const info = $("model-info");
  const file = $("puzzle-file");
  const renderer = new PuzzleRenderer($("puzzle-canvas"));
  const controls = ["scramble", "undo", "redo", "reset", "library"];

  function updateModelInfo(api) {
    const model = api.getModelInfo();
    info.textContent = `Pascal ${api.getVersion()} · model ${model.connected ? "connected" : "offline"} · ${model.parts} parts · ${model.axes} axes`;
    for (const id of controls) $(id).disabled = !model.ready;
    if (typeof api.getRenderData === "function") renderer.setGeometry(api.getRenderData());
  }

  function call(name, ...args) {
    const api = window.pCubes;
    if (!api || typeof api[name] !== "function") {
      status.textContent = "Pascal API unavailable: " + name;
      return;
    }
    try {
      const result = api[name](...args);
      if (typeof result === "string") status.textContent = result;
      else if (result === false) status.textContent = "Pascal could not complete this request.";
      updateModelInfo(api);
    } catch (error) {
      status.textContent = "Pascal error: " + error.message;
    }
  }

  function start() {
    try {
      if (!window.rtl || typeof window.rtl.run !== "function") {
        throw new Error("Pas2JS RTL missing. Compile with -Jirtl.js.");
      }
      window.rtl.run();
      const api = window.pCubes;
      if (!api) throw new Error("Pascal program did not install window.pCubes.");
      status.textContent = api.getStatus();
      updateModelInfo(api);
    } catch (error) {
      status.textContent = error.message;
      info.textContent = "Check the browser console for details.";
    }
  }

  $("scramble").addEventListener("click", () => call("scramble"));
  $("undo").addEventListener("click", () => call("undo"));
  $("redo").addEventListener("click", () => call("redo"));
  $("reset").addEventListener("click", () => call("reset"));
  $("library").addEventListener("click", () => call("openLibrary"));
  $("load").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const selected = file.files && file.files[0];
    if (!selected) return;
    call("loadXML", await selected.text());
    file.value = "";
  });

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();