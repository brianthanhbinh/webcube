import { PuzzleRenderer } from "./renderer.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const status = $("engine-status");
  const info = $("model-info");
  const file = $("puzzle-file");
  const renderer = new PuzzleRenderer($("puzzle-canvas"));
  const controls = ["scramble", "undo", "redo", "reset", "library"];
  let originalXmlText = "";

  function parseXml(text) {
    const xmlDocument = new DOMParser().parseFromString(text, "application/xml");
    const parseError = xmlDocument.getElementsByTagName("parsererror")[0];
    if (parseError) throw new Error(parseError.textContent || "Invalid XML.");
    if (!xmlDocument.documentElement) throw new Error("XML has no root element.");
    return xmlDocument;
  }

  function addBuiltinCubeFigure(loadNode) {
    const fileName = (loadNode.getAttribute("File") || "").replace(/\\\\/g, "/").toLowerCase();
    if (!fileName.endsWith("figures/cube.xml") && fileName !== "cube.xml") {
      throw new Error('Missing external figure "' + loadNode.getAttribute("File") +
        '". This browser build currently includes Figures/Cube.xml only.');
    }

    const rawWidth = loadNode.getAttribute("W");
    const width = rawWidth === null || rawWidth.trim() === "" ? 1 : Number(rawWidth);
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error("The cube figure W attribute must be a positive number.");
    }

    const doc = loadNode.ownerDocument;
    const part = doc.createElement("Part");
    const vertices = doc.createElement("Vertices");
    const faces = doc.createElement("Faces");
    const coordinates = [
      [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
      [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1]
    ];

    for (const point of coordinates) {
      const vector = doc.createElement("Vector");
      vector.setAttribute("X", String(point[0] * width));
      vector.setAttribute("Y", String(point[1] * width));
      vector.setAttribute("Z", String(point[2] * width));
      vertices.appendChild(vector);
    }

    const definitions = [
      ["C80000", "0;1;3;2"], ["FF800A", "5;4;6;7"],
      ["0000C8", "1;0;4;5"], ["009600", "2;3;7;6"],
      ["FFFF00", "0;2;6;4"], ["FFFFFF", "3;1;5;7"]
    ];
    for (const [color, indexes] of definitions) {
      const face = doc.createElement("Face");
      face.setAttribute("Color", color);
      face.setAttribute("VertexIndexes", indexes);
      faces.appendChild(face);
    }

    part.append(vertices, faces);
    loadNode.parentNode.insertBefore(part, loadNode);
    loadNode.parentNode.removeChild(loadNode);
  }

  function resolveExternalFigures(xmlDocument) {
    const nodes = Array.from(xmlDocument.getElementsByTagName("LoadFrom"));
    for (const node of nodes) addBuiltinCubeFigure(node);
  }

  function updateModelInfo(api) {
    const model = api.getModelInfo();
    info.textContent = `Pascal ${api.getVersion()} · model ${model.connected ? "connected" : "offline"} · ${model.parts} parts · ${model.axes} axes · undo ${model.undoCount} · redo ${model.redoCount}`;
    for (const id of controls) $(id).disabled = !model.ready;
    $("load").disabled = false;
    if (typeof api.getRenderData === "function") renderer.setGeometry(api.getRenderData());
  }

  function call(name, ...args) {
    const api = window.pCubes;
    if (!api || typeof api[name] !== "function") {
      status.textContent = "Pascal API unavailable: " + name;
      return false;
    }
    try {
      const result = api[name](...args);
      if (typeof result === "string") status.textContent = result;
      else if (result === false) status.textContent = "Pascal could not complete this request.";
      updateModelInfo(api);
      return result !== false;
    } catch (error) {
      status.textContent = "Pascal error: " + error.message;
      return false;
    }
  }

  function loadXmlText(xmlText) {
    const xmlDocument = parseXml(xmlText);
    resolveExternalFigures(xmlDocument);
    if (!call("loadXML", xmlDocument.documentElement)) return false;
    originalXmlText = xmlText;
    return true;
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
  $("reset").addEventListener("click", () => {
    if (!originalXmlText) {
      status.textContent = "Load a puzzle XML file before using Reset.";
      return;
    }
    try { loadXmlText(originalXmlText); }
    catch (error) { status.textContent = "Reset failed: " + error.message; }
  });
  $("library").addEventListener("click", () => {
    status.textContent = "The built-in library is not available in this browser build yet. Use Load puzzle XML.";
  });
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
      xmlText = xmlText.replace(/(<\?xml[^>]*?)\s+encoding\s*=\s*(["'])[^"']+\2/i, "$1");
      loadXmlText(xmlText);
    } catch (error) {
      status.textContent = "XML load failed: " + error.message;
    } finally {
      file.value = "";
    }
  });

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();