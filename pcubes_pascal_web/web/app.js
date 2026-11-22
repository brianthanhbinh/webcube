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
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const header = new TextDecoder("windows-1252").decode(bytes.slice(0, 256));
      const declaredEncoding = header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
      const encoding = declaredEncoding ? declaredEncoding[1] : "utf-8";
      let xmlText = new TextDecoder(encoding).decode(bytes);
      // The file is already decoded to Unicode; the XML declaration must not
      // ask the browser parser to reinterpret the original byte encoding.
      xmlText = xmlText.replace(/(<\?xml[^>]*?)\s+encoding\s*=\s*(["'])[^"']+\2/i, "$1");
      const xmlDocument = new DOMParser().parseFromString(xmlText, "application/xml");
      const parseError = xmlDocument.getElementsByTagName("parsererror")[0];
      if (parseError) throw new Error(parseError.textContent || "Invalid XML.");
      if (!xmlDocument.documentElement) throw new Error("XML has no root element.");
      call("loadXML", xmlDocument.documentElement);
    } catch (error) {
      status.textContent = "XML load failed: " + error.message;
    } finally {
      file.value = "";
    }
  });

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();