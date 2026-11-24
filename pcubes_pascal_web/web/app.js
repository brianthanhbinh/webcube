import { PuzzleRenderer } from "./renderer.js";
import { loadBuiltinLibrary } from "./library-data.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const status = $("engine-status");
  const info = $("model-info");
  const file = $("puzzle-file");
  const renderer = new PuzzleRenderer($("puzzle-canvas"));
  renderer.onTurnDrag = (dx, dy, pick) => {
    if (!pick) { status.textContent = "Drag from a visible puzzle face to turn its layer."; return; }
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
    if (Math.abs(delta) < 18) return;
    const axisSelect = $("turn-axis"), layerSelect = $("turn-layer");
    axisSelect.value = String(pick.axis);
    refreshTurnControls(window.pCubes);
    layerSelect.value = String(pick.layer);
    const direction = (delta >= 0 ? 1 : -1) * (pick.normalSign || 1);
    call("turnLayer", pick.axis, pick.layer, direction);
  };
  const controls = ["scramble", "undo", "redo", "reset", "turn-ccw", "turn-cw"];
  let originalXmlText = "";
  let libraryData = null;
  let preflightPassed = false;
  let preflightReport = [];

  function parseXml(text) {
    // DOMParser receives a JavaScript Unicode string, not raw file bytes; remove
    // the original byte-encoding declaration before parsing that string.
    const source = String(text).replace(/(<\?xml[^>]*?)\s+encoding\s*=\s*(["'])[^"']+\2/i, "$1");
    const doc = new DOMParser().parseFromString(source, "application/xml");
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

  function buildCubeCubies(doc, size) {
    const figure = doc.getElementsByTagName("Figure")[0];
    const axesNode = doc.getElementsByTagName("Axes")[0];
    if (!figure || !axesNode) throw new Error("Cube XML is missing Figure or Axes.");
    const planes = size === 3 ? "-1/6;1/6" : "0";
    axesNode.setAttribute("PlaneDistances", planes);
    axesNode.setAttribute("TurningAngles", "Pi/2");
    for (const axis of Array.from(axesNode.getElementsByTagName("Axis"))) {
      axis.setAttribute("PlaneDistances", planes);
      axis.setAttribute("TurningAngles", "Pi/2");
    }
    figure.replaceChildren();
    const centers = size === 3 ? [-1/3, 0, 1/3] : [-0.25, 0.25];
    const half = size === 3 ? 0.158 : 0.24;
    const faces = [
      ["C80000", "252525", 0, "0;1;3;2"],
      ["FF800A", "252525", 1, "5;4;6;7"],
      ["0000C8", "252525", 2, "1;0;4;5"],
      ["009600", "252525", 3, "2;3;7;6"],
      ["FFFF00", "252525", 4, "0;2;6;4"],
      ["FFFFFF", "252525", 5, "3;1;5;7"]
    ];
    for (let ix=0; ix<size; ix++) for (let iy=0; iy<size; iy++) for (let iz=0; iz<size; iz++) {
      const cx=centers[ix], cy=centers[iy], cz=centers[iz];
      const points=[
        [cx-half,cy-half,cz-half],[cx-half,cy-half,cz+half],
        [cx-half,cy+half,cz-half],[cx-half,cy+half,cz+half],
        [cx+half,cy-half,cz-half],[cx+half,cy-half,cz+half],
        [cx+half,cy+half,cz-half],[cx+half,cy+half,cz+half]
      ];
      const part=doc.createElement("Part"), vertices=doc.createElement("Vertices"), faceList=doc.createElement("Faces");
      for(const point of points){const add=doc.createElement("Add");add.setAttribute("Vector",point.join("; "));vertices.appendChild(add);}
      for(const [outer,inner,side,indexes] of faces){
        const visible = side===0 ? ix===0 : side===1 ? ix===size-1 : side===2 ? iy===0 : side===3 ? iy===size-1 : side===4 ? iz===0 : iz===size-1;
        const face=doc.createElement("Face");face.setAttribute("Color",visible?outer:inner);face.setAttribute("VertexIndexes",indexes);faceList.appendChild(face);
      }
      part.append(vertices,faceList);figure.appendChild(part);
    }
  }

  function resolveExternalFigures(doc) {
    const name = doc.getElementsByTagName("Name")[0]?.textContent || "";
    if (/Rubik's cube 2x2x2/i.test(name)) {
      buildCubeCubies(doc, 2);
      return;
    }
    if (/Rubik's cube 3x3x3/i.test(name)) {
      buildCubeCubies(doc, 3);
      return;
    }
    // Copy shared axis attributes to each Axis for other browser-loadable XMLs.
    const axesNode = doc.getElementsByTagName("Axes")[0];
    if (axesNode) for (const axis of Array.from(axesNode.getElementsByTagName("Axis"))) {
      for (const attr of ["PlaneDistances", "TurningAngles", "AvailableAngles", "JumbleAngle", "FixedLayers", "MinAngles", "MaxAngles"])
        if (!axis.hasAttribute(attr) && axesNode.hasAttribute(attr)) axis.setAttribute(attr, axesNode.getAttribute(attr));
    }
    for (const node of Array.from(doc.getElementsByTagName("LoadFrom"))) addBuiltinCubeFigure(node);
  }

  function updateModelInfo(api) {
    const model = api.getModelInfo();
    info.textContent = `Pascal ${api.getVersion()} · model ${model.connected ? "connected" : "offline"} · ${model.parts} parts · ${model.axes} axes · undo ${model.undoCount} · redo ${model.redoCount}`;
    for (const id of controls) $(id).disabled = !model.ready || !preflightPassed;
    $("library").disabled = !preflightPassed;
    $("load").disabled = false;
    refreshTurnControls(api);
    if (typeof api.getRenderData === "function") renderer.setGeometry(api.getRenderData());
  }

  function refreshTurnControls(api) {
    const axes = api.getAxesInfo?.() || [];
    const axisSelect = $("turn-axis"), layerSelect = $("turn-layer");
    const oldAxis = Number(axisSelect.value) || 0, oldLayer = Number(layerSelect.value) || 0;
    axisSelect.replaceChildren();
    for (const axis of axes) {
      const option = document.createElement("option");
      option.value = axis.index;
      option.textContent = "Axis " + (axis.index + 1) + " (" + [axis.x,axis.y,axis.z].map(v=>Number(v).toFixed(1)).join(", ") + ")";
      axisSelect.append(option);
    }
    if (axes.length) {
      axisSelect.value = String(Math.min(oldAxis, axes.length - 1));
      const axis = axes[Number(axisSelect.value)];
      layerSelect.replaceChildren();
      for (let i=0;i<axis.layers;i++) {
        const option=document.createElement("option"); option.value=i; option.textContent="Layer "+(i+1); layerSelect.append(option);
      }
      layerSelect.value=String(Math.min(oldLayer,Math.max(0,axis.layers-1)));
    }
    axisSelect.disabled=layerSelect.disabled=!preflightPassed||!axes.length;
    $("turn-ccw").disabled=$("turn-cw").disabled=!preflightPassed||!axes.length;
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

  $("turn-axis").addEventListener("change", () => refreshTurnControls(window.pCubes));
  $("turn-ccw").addEventListener("click", () => call("turnLayer", Number($("turn-axis").value), Number($("turn-layer").value), -1));
  $("turn-cw").addEventListener("click", () => call("turnLayer", Number($("turn-axis").value), Number($("turn-layer").value), 1));
  $("view-reset").addEventListener("click", () => renderer.resetView());
  $("scramble").addEventListener("click", () => {
    const api = window.pCubes;
    if (!api?.isPuzzleReady?.()) { status.textContent = "Load a puzzle before scrambling."; return; }
    const axes = api.getAxesInfo().filter(axis => axis.enabled && axis.layers > 0);
    const moves = [];
    let previous = null;
    for (let attempt = 0; attempt < 500 && moves.length < 30; attempt++) {
      if (!axes.length) break;
      const axis = axes[Math.floor(Math.random() * axes.length)];
      const layer = Math.floor(Math.random() * axis.layers);
      const direction = Math.random() < 0.5 ? -1 : 1;
      if (previous && previous.axis === axis.index && previous.layer === layer && previous.direction === -direction) continue;
      if (call("turnLayer", axis.index, layer, direction)) {
        moves.push({ axis: axis.index, layer, direction });
        previous = moves[moves.length - 1];
      }
    }
    status.textContent = moves.length
      ? "Scrambled: " + moves.length + " random layer turns."
      : "Scramble failed: this puzzle has no movable layers.";
  });
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

  function recordTest(name, passed, detail = "") {
    preflightReport.push({ name, passed, detail });
    const report = $("preflight-results");
    if (report) {
      report.textContent = preflightReport.map(t => `${t.passed ? "PASS" : "FAIL"} · ${t.name}${t.detail ? " — " + t.detail : ""}`).join(" | ");
      report.dataset.result = preflightReport.every(t => t.passed) ? "pass" : "fail";
    }
    if (!passed) throw new Error(name + (detail ? ": " + detail : ""));
  }

  async function runPreflight(api) {
    preflightReport = [];
    const required = ["getStatus", "getVersion", "isPuzzleReady", "getModelInfo", "getRenderData", "getAxesInfo", "turnLayer", "scramble", "undo", "redo", "reset", "openLibrary", "loadXML"];
    for (const name of required) recordTest("API " + name, typeof api[name] === "function");
    recordTest("Pascal version", typeof api.getVersion() === "string" && api.getVersion().length > 0);
    recordTest("Initial status", typeof api.getStatus() === "string");
    recordTest("Initial model info", !!api.getModelInfo() && typeof api.getModelInfo().connected === "boolean");

    const library = await loadBuiltinLibrary();
    recordTest("Library data", Array.isArray(library.puzzles) && library.puzzles.length > 0, library.puzzles.length + " entries");
    const cube = library.puzzles.find(entry => /3x3x3/i.test(entry.name) && supported(entry)) ||
                 library.puzzles.find(entry => /2x2x2/i.test(entry.name) && supported(entry));
    recordTest("Built-in cube entry", !!cube, cube ? cube.name : "No supported cube found");
    const cubeDoc = parseXml(cube.xml);
    recordTest("XML parser", !!cubeDoc.documentElement && cubeDoc.getElementsByTagName("parsererror").length === 0);
    const encodingProbe = parseXml('<?xml version="1.0" encoding="windows-1251"?><xml><Name>Cube</Name></xml>');
    recordTest("Legacy XML encoding", encodingProbe.documentElement.nodeName === "xml" && encodingProbe.getElementsByTagName("Name")[0].textContent === "Cube");
    resolveExternalFigures(cubeDoc);
    recordTest("Pascal loadXML", loadXmlText(cube.xml));
    const model = api.getModelInfo();
    recordTest("Cube model ready", api.isPuzzleReady() && model.ready, model.parts + " parts, " + model.axes + " axes; " + JSON.stringify(api.getAxesInfo()));
    if (/3x3x3/i.test(cube.name)) recordTest("3x3 cubie split", model.parts >= 20, model.parts + " cubies");
    let geometry = api.getRenderData();
    recordTest("3D geometry export", !!geometry && Array.isArray(geometry.faces) && geometry.faces.length > 0,
      geometry && geometry.faces ? geometry.faces.length + " faces" : "No faces");
    renderer.setGeometry(geometry);
    recordTest("Canvas renderer", !!renderer.geometry && renderer.geometry.faces.length > 0);

    const beforeScramble = JSON.stringify(api.getRenderData());
    const scrambled = api.scramble();
    const afterScramble = JSON.stringify(api.getRenderData());
    recordTest("Scramble", scrambled === true && afterScramble !== beforeScramble, "must change exported geometry; axes=" + JSON.stringify(api.getAxesInfo()));
    api.undo();
    recordTest("Undo", api.isPuzzleReady());
    api.redo();
    recordTest("Redo", api.isPuzzleReady());
    api.reset();
    recordTest("Reset API", api.isPuzzleReady());
    geometry = api.getRenderData();
    recordTest("Reset geometry", Array.isArray(geometry.faces) && geometry.faces.length > 0);

    // Also verify the same XML reload path used by the visible Reset button.
    recordTest("Reset/reload", loadXmlText(originalXmlText) && api.isPuzzleReady());
    geometry = api.getRenderData();
    recordTest("Post-reset rendering", Array.isArray(geometry.faces) && geometry.faces.length > 0);
    renderer.setGeometry(geometry);
    api.openLibrary();
    recordTest("Open library API", typeof api.getStatus() === "string");
    const fileProbe = new Blob(['<?xml version="1.0" encoding="UTF-8"?><xml/>']);
    const fileText = new TextDecoder("utf-8").decode(new Uint8Array(await fileProbe.arrayBuffer()));
    recordTest("File byte decoding", parseXml(fileText).documentElement.nodeName === "xml");
    return cube.name;
  }

  async function start() {
    try {
      if (!window.rtl || typeof window.rtl.run !== "function") throw new Error("Pas2JS RTL missing. Compile with -Jirtl.js.");
      window.rtl.run();
      const api = window.pCubes; if (!api) throw new Error("Pascal program did not install window.pCubes.");
      status.textContent = "Running startup tests…";
      const cubeName = await runPreflight(api);
      preflightPassed = true;
      updateModelInfo(api);
      status.textContent = "All " + preflightReport.length + " startup tests passed. Loaded " + cubeName + ".";
      document.documentElement.dataset.preflight = "passed";
    } catch (error) {
      preflightPassed = false;
      for (const id of [...controls, "library", "scramble", "undo", "redo", "reset"]) if ($(id)) $(id).disabled = true;
      status.textContent = "STARTUP TEST FAILED — app locked: " + error.message;
      info.textContent = "Fix the failing preflight test before using the puzzle app.";
      document.documentElement.dataset.preflight = "failed";
      const report = $("preflight-results");
      if (report) report.dataset.result = "fail";
    }
  }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
})();
