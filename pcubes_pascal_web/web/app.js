import { PuzzleRenderer } from "./renderer.js";
import { loadBuiltinLibrary } from "./library-data.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const status = $("engine-status");
  const info = $("model-info");
  const file = $("puzzle-file");
  const renderer = new PuzzleRenderer($("puzzle-canvas"));
  const controls = ["scramble", "undo", "redo", "reset"];
  let originalXmlText = "";
  let libraryData = null;

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const error = doc.getElementsByTagName("parsererror")[0];
    if (error) throw new Error(error.textContent || "Invalid XML.");
    if (!doc.documentElement) throw new Error("XML has no root element.");
    return doc;
  }

  function addBuiltinCubeFigure(loadNode) {
    const name = (loadNode.getAttribute("File") || "").replace(/\\/g, "/").toLowerCase();
    if (!name.endsWith("figures/cube.xml") && name !== "cube.xml")
      throw new Error('This library item needs an external figure not supported in the browser: "' + loadNode.getAttribute("File") + '".');
    const raw = loadNode.getAttribute("W");
    const width = raw === null || raw.trim() === "" ? 1 : Number(raw);
    if (!Number.isFinite(width) || width <= 0) throw new Error("The cube figure W attribute must be positive.");
    const doc = loadNode.ownerDocument, part = doc.createElement("Part");
    const vertices = doc.createElement("Vertices"), faces = doc.createElement("Faces");
    const points = [[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]];
    for (const p of points) {
      const v = doc.createElement("Vector");
      v.setAttribute("X", String(p[0]*width)); v.setAttribute("Y", String(p[1]*width)); v.setAttribute("Z", String(p[2]*width));
      vertices.appendChild(v);
    }
    for (const [color, indexes] of [["C80000","0;1;3;2"],["FF800A","5;4;6;7"],["0000C8","1;0;4;5"],["009600","2;3;7;6"],["FFFF00","0;2;6;4"],["FFFFFF","3;1;5;7"]]) {
      const face = doc.createElement("Face"); face.setAttribute("Color",color); face.setAttribute("VertexIndexes",indexes); faces.appendChild(face);
    }
    part.append(vertices, faces); loadNode.parentNode.insertBefore(part, loadNode); loadNode.remove();
  }

  function resolveExternalFigures(doc) {
    for (const node of Array.from(doc.getElementsByTagName("LoadFrom"))) addBuiltinCubeFigure(node);
  }

  function updateModelInfo(api) {
    const model = api.getModelInfo();
    info.textContent = `Pascal ${api.getVersion()} · model ${model.connected ? "connected" : "offline"} · ${model.parts} parts · ${model.axes} axes · undo ${model.undoCount} · redo ${model.redoCount}`;
    for (const id of controls) $(id).disabled = !model.ready;
    $("library").disabled = false;
    $("load").disabled = false;
    if (typeof api.getRenderData === "function") renderer.setGeometry(api.getRenderData());
  }

  function call(name, ...args) {
    const api = window.pCubes;
    if (!api || typeof api[name] !== "function") { status.textContent = "Pascal API unavailable: " + name; return false; }
    try {
      const result = api[name](...args);
      if (typeof result === "string") status.textContent = result;
      else if (result === false) status.textContent = "Pascal could not complete this request.";
      updateModelInfo(api); return result !== false;
    } catch (error) { status.textContent = "Pascal error: " + error.message; return false; }
  }

  function loadXmlText(xmlText) {
    const doc = parseXml(xmlText); resolveExternalFigures(doc);
    if (!call("loadXML", doc.documentElement)) return false;
    originalXmlText = xmlText; return true;
  }

  function supported(entry) {
    const doc = parseXml(entry.xml);
    return Array.from(doc.getElementsByTagName("LoadFrom")).every(n => {
      const path = (n.getAttribute("File") || "").replace(/\\/g, "/").toLowerCase();
      return path.endsWith("figures/cube.xml") || path === "cube.xml";
    });
  }

  async function showLibrary() {
    const dialog = $("library-dialog"), list = $("library-list"), search = $("library-search");
    list.textContent = "Loading library…";
    dialog.showModal();
    try {
      libraryData ||= await loadBuiltinLibrary();
      const draw = () => {
        const query = search.value.trim().toLowerCase();
        list.replaceChildren();
        for (const entry of libraryData.puzzles) {
          if (!entry.name.toLowerCase().includes(query) && !entry.menu.toLowerCase().includes(query)) continue;
          const button = document.createElement("button");
          button.className = "library-item";
          button.type = "button";
          const title = document.createElement("strong"); title.textContent = entry.name;
          const meta = document.createElement("small"); meta.textContent = entry.menu || entry.path;
          button.append(title, meta);
          const canLoad = supported(entry);
          if (!canLoad) { button.disabled = true; button.title = "This puzzle depends on an external macro/figure not included in the browser engine."; }
          else button.addEventListener("click", () => {
            try { if (loadXmlText(entry.xml)) dialog.close(); }
            catch (error) { status.textContent = "Library load failed: " + error.message; }
          });
          list.appendChild(button);
        }
        if (!list.children.length) list.textContent = "No matching puzzles.";
      };
      search.oninput = draw; draw();
    } catch (error) { list.textContent = "Library failed to load: " + error.message; }
  }

  $("scramble").addEventListener("click", () => call("scramble"));
  $("undo").addEventListener("click", () => call("undo"));
  $("redo").addEventListener("click", () => call("redo"));
  $("reset").addEventListener("click", () => {
    if (!originalXmlText) { status.textContent = "Load a puzzle before using Reset."; return; }
    try { loadXmlText(originalXmlText); } catch (error) { status.textContent = "Reset failed: " + error.message; }
  });
  $("library").addEventListener("click", showLibrary);
  $("library-close").addEventListener("click", () => $("library-dialog").close());
  $("load").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const selected = file.files && file.files[0]; if (!selected) return;
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const header = new TextDecoder("windows-1252").decode(bytes.slice(0,256));
      const declared = header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
      const encoding = declared ? declared[1] : "utf-8";
      let xml = new TextDecoder(encoding).decode(bytes);
      xml = xml.replace(/(<\?xml[^>]*?)\s+encoding\s*=\s*(["'])[^"']+\2/i, "$1");
      loadXmlText(xml);
    } catch (error) { status.textContent = "XML load failed: " + error.message; }
    finally { file.value = ""; }
  });

  function start() {
    try {
      if (!window.rtl || typeof window.rtl.run !== "function") throw new Error("Pas2JS RTL missing. Compile with -Jirtl.js.");
      window.rtl.run();
      const api = window.pCubes; if (!api) throw new Error("Pascal program did not install window.pCubes.");
      status.textContent = api.getStatus(); updateModelInfo(api);
    } catch (error) { status.textContent = error.message; info.textContent = "Check the browser console for details."; }
  }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
})();
