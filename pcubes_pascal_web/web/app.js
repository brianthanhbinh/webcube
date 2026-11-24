import { PuzzleRenderer } from "./renderer.js";
import { loadBuiltinLibrary } from "./library-data.js";
import { generatePuzzle } from "./generator.js";
import { loadRemoteLibraryIndex, fetchRemotePuzzle } from "./remote-library.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const status = $("engine-status");
  const info = $("model-info");
  const file = $("puzzle-file");
  const figureFile = $("figure-file");
  const figureFolder = $("figure-folder");
  let pendingPuzzleDoc = null;
  const renderer = new PuzzleRenderer($("puzzle-canvas"));
  renderer.onTurnCommit = (pick, turns, before, axis, previewAngle) => {
    const axisSelect = $("turn-axis"), layerSelect = $("turn-layer");
    axisSelect.value = String(pick.axis);
    refreshTurnControls(window.pCubes);
    layerSelect.value = String(pick.layer);
    const direction = Math.sign(turns);
    renderer.deferGeometry = true;
    let succeeded = true;
    for (let i=0;i<Math.abs(turns);i++) {
      if (!call("turnLayer", pick.axis, pick.layer, direction)) { succeeded = false; break; }
    }
    renderer.deferGeometry = false;
    const target = window.pCubes?.getRenderData?.();
    if (succeeded && target) {
       renderer.animateTurn(before, target, axis, turns * (Number(axis.angle) || Math.PI/2), 180, previewAngle, pick.layer, pick.normalSign || 1);
    } else renderer.setGeometry(window.pCubes?.getRenderData?.() || before);
  };
  renderer.onTurnDrag = () => {
    status.textContent = "Drag from a visible puzzle face to turn its layer.";
  };
  const controls = ["scramble", "undo", "redo", "reset", "turn-ccw", "turn-cw"];
  let originalXmlText = "";
  let libraryData = null;
  let remoteLibrary = null;
  let preflightPassed = false;
  let preflightReport = [];

  function setFigurePickerEnabled(enabled) {
    $("add-figure").disabled = !enabled;
    $("load-figure-folder").disabled = !enabled;
  }

  function extractXmlDocument(input) {
    let source = String(input ?? "").replace(/^\uFEFF/, "");
    const scanEnd = (start, terminator) => {
      let quote = "";
      for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (quote) { if (ch === quote) quote = ""; continue; }
        if (ch === "'" || ch === '"') { quote = ch; continue; }
        if (source.startsWith(terminator, i)) return i + terminator.length;
      }
      return -1;
    };
    let i = 0, rootStart = -1, rootEnd = -1, depth = 0;
    while (i < source.length) {
      const open = source.indexOf("<", i);
      if (open < 0) break;
      if (source.startsWith("<!--", open)) {
        const end = source.indexOf("-->", open + 4); if (end < 0) break;
        i = end + 3; continue;
      }
      if (source.startsWith("<![CDATA[", open)) {
        const end = source.indexOf("]]>", open + 9); if (end < 0) break;
        i = end + 3; continue;
      }
      if (source.startsWith("<?", open)) {
        const end = scanEnd(open + 2, "?>"); if (end < 0) break;
        i = end; continue;
      }
      if (/^<!DOCTYPE\b/i.test(source.slice(open, open + 10))) {
        let end = open + 9, quote = "", subset = 0;
        for (; end < source.length; end++) {
          const ch = source[end];
          if (quote) { if (ch === quote) quote = ""; continue; }
          if (ch === "'" || ch === '"') { quote = ch; continue; }
          if (ch === "[") subset++;
          else if (ch === "]") subset = Math.max(0, subset - 1);
          else if (ch === ">" && subset === 0) { end++; break; }
        }
        i = end; continue;
      }
      const end = scanEnd(open + 1, ">");
      if (end < 0) break;
      const token = source.slice(open, end);
      const match = token.match(/^<\s*(\/?)([A-Za-z_][\w.:-]*)[\s\S]*?>$/);
      if (!match) { i = end; continue; }
      const closing = match[1] === "/";
      const selfClosing = !closing && /\/\s*>$/.test(token);
      if (rootStart < 0) {
        if (closing) { i = end; continue; }
        rootStart = open;
        if (selfClosing) { rootEnd = end; break; }
        depth = 1;
      } else if (closing) {
        depth--;
        if (depth === 0) { rootEnd = end; break; }
      } else if (!selfClosing) depth++;
      i = end;
    }
    if (rootStart < 0 || rootEnd < 0)
      throw new Error("No complete XML document root was found.");
    const declarationStart = source.lastIndexOf("<?xml", rootStart);
    const doctypeStart = source.lastIndexOf("<!DOCTYPE", rootStart);
    const prefixStart = declarationStart >= 0 ? declarationStart :
      doctypeStart >= 0 ? doctypeStart : rootStart;
    return source.slice(prefixStart, rootEnd);
  }

  function parseXml(text) {
    let source = extractXmlDocument(text).trim();
    // DOMParser receives Unicode text, not the original encoded byte stream.
    source = source.replace(/(<\?xml\b[^>]*?)\s+encoding\s*=\s*(['"])[^'"]*\2/i, "$1");
    const doc = new DOMParser().parseFromString(source, "application/xml");
    const error = doc.getElementsByTagName("parsererror")[0];
    if (error) throw new Error(error.textContent || "Invalid XML.");
    if (!doc.documentElement) throw new Error("XML has no root element.");
    return doc;
  }
  function addBuiltinFigure(loadNode) {
    const name = (loadNode.getAttribute("File") || "").replace(/\\/g, "/").toLowerCase();
    const kind = name.split("/").pop().replace(/\.xml$/i, "");
    const doc = loadNode.ownerDocument, part = doc.createElement("Part");
    const vertices = doc.createElement("Vertices"), faces = doc.createElement("Faces");
    const parameter = (key, fallback) => {
      const raw = loadNode.getAttribute(key);
      const value = raw === null || raw.trim() === "" ? fallback : Number(raw);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid " + key + " value for " + kind + " figure.");
      return value;
    };
    let points, faceData;
    if (kind === "cube") {
      const w = parameter("W", 1);
      points = [[-w,-w,-w],[-w,-w,w],[-w,w,-w],[-w,w,w],[w,-w,-w],[w,-w,w],[w,w,-w],[w,w,w]];
      faceData = [["C80000","0;1;3;2"],["FF800A","5;4;6;7"],["0000C8","1;0;4;5"],["009600","2;3;7;6"],["FFFF00","0;2;6;4"],["FFFFFF","3;1;5;7"]];
    } else if (kind === "cuboid") {
      const wx = parameter("Wx", parameter("W", 0.5));
      const wy = parameter("Wy", parameter("W", 0.5));
      const wz = parameter("Wz", parameter("W", 0.5));
      const dx = Number(loadNode.getAttribute("DWX") || 0), dy = Number(loadNode.getAttribute("DWY") || 0), dz = Number(loadNode.getAttribute("DWZ") || 0);
      if (![dx,dy,dz].every(Number.isFinite)) throw new Error("Invalid cuboid offset.");
      points = [
        [-wx+dx,-wy+dy,-wz+dz],[-wx+dx,-wy+dy,wz+dz],[-wx+dx,wy+dy,-wz+dz],[-wx+dx,wy+dy,wz+dz],
        [wx+dx,-wy+dy,-wz+dz],[wx+dx,-wy+dy,wz+dz],[wx+dx,wy+dy,-wz+dz],[wx+dx,wy+dy,wz+dz]
      ];
      faceData = [["C80000","0;1;3;2"],["FF800A","5;4;6;7"],["0000C8","1;0;4;5"],["009600","2;3;7;6"],["FFFF00","0;2;6;4"],["FFFFFF","3;1;5;7"]];
    } else if (kind === "tetrahedron") {
      const w = parameter("W", 0.5);
      points = [[w,w,w],[-w,-w,w],[-w,w,-w],[w,-w,-w]];
      faceData = [["C80000","1;2;3"],["0000C8","0;3;2"],["009600","0;1;3"],["FFFF00","0;2;1"]];
    } else {
      throw new Error('Figure "' + loadNode.getAttribute("File") + '" is not bundled. Use Add figure to select its XML file.');
    }
    for (const p of points) {
      const v = doc.createElement("Vector");
      v.setAttribute("X", String(p[0])); v.setAttribute("Y", String(p[1])); v.setAttribute("Z", String(p[2]));
      vertices.appendChild(v);
    }
    for (const [color, indexes] of faceData) {
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

  function expandKnownFigureScript(puzzleDoc, figureDoc, root, loadOverride = null) {
    const scriptNode = root.getElementsByTagName("Script")[0];
    if (!scriptNode) return;
    const script = scriptNode.textContent || "";
    const loads = Array.from(puzzleDoc.getElementsByTagName("LoadFrom"));
    const load = loadOverride || loads[0];
    if (!load) throw new Error("Puzzle XML has no LoadFrom placeholder inside Figure.");
    const number = (name, fallback) => {
      const raw = load.getAttribute(name);
      const value = raw === null || raw.trim() === "" ? fallback : Number(raw);
      if (!Number.isFinite(value)) throw new Error("Invalid figure parameter " + name + ".");
      return value;
    };
    let vertices;
    let colors = ["C80000", "FF800A", "0000C8", "009600", "FFFF00", "FFFFFF"];
    const cubeScript = /Cube_Coordinates\.inc/i.test(script);
    const cuboidScript = /Cuboid_Coordinates\.inc/i.test(script);
    const tetraScript = /Vx\[3\]/i.test(script) && !cubeScript && !cuboidScript;
    if (cubeScript) {
      const w = number("W", 1);
      vertices = [[-w,-w,-w],[-w,-w,w],[-w,w,-w],[-w,w,w],[w,-w,-w],[w,-w,w],[w,w,-w],[w,w,w]];
    } else if (cuboidScript) {
      const w = number("W", 0.5), wx = number("Wx", w), wy = number("Wy", w), wz = number("Wz", w);
      const dx = number("DWX", 0), dy = number("DWY", 0), dz = number("DWZ", 0);
      vertices = [
        [-wx+dx,-wy+dy,-wz+dz],[-wx+dx,-wy+dy,wz+dz],[-wx+dx,wy+dy,-wz+dz],[-wx+dx,wy+dy,wz+dz],
        [wx+dx,-wy+dy,-wz+dz],[wx+dx,-wy+dy,wz+dz],[wx+dx,wy+dy,-wz+dz],[wx+dx,wy+dy,wz+dz]
      ];
    } else if (tetraScript) {
      const w = number("W", 0.5);
      vertices = [[w,w,w],[-w,-w,w],[-w,w,-w],[w,-w,-w]];
      colors = ["C80000", "0000C8", "009600", "FFFF00"];
    } else {
      // The browser Pascal build does not execute Pascal Script nodes. Convert
      // data-only coordinate scripts (Vx[i], Vy[i], Vz[i], Colors[i]) into XML.
      const arrays = Object.create(null), params = Object.create(null);
      for (const name of ["W","Wr","Wh","Wx","Wy","Wz","DWX","DWY","DWZ"]) {
        const raw=load.getAttribute(name);
        if(raw!==null&&raw.trim()!==""){const value=Number(raw);if(!Number.isFinite(value))throw new Error("Invalid figure parameter "+name+".");params[name]=value;}
      }
      const evaluate = source => {
        const tokens=String(source).match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[()+\-*/^]/g)||[];
        let at=0;
        const primary=()=>{
          const token=tokens[at++];
          if(token==="+"||token==="-"){const value=primary();return token==="-"?-value:value;}
          if(token==="("){const value=expression();if(tokens[at++]!==")")throw new Error("Unclosed figure expression.");return value;}
          if(token&&(/^[0-9]/.test(token)||/^\./.test(token)))return Number(token);
          if(token&&/^[A-Za-z_]\w*$/.test(token)){
            if(tokens[at]==="("){at++;const value=expression();if(tokens[at++]!==")")throw new Error("Invalid figure function.");const fn=token.toLowerCase();if(fn==="sqrt")return Math.sqrt(value);if(fn==="sin")return Math.sin(value);if(fn==="cos")return Math.cos(value);throw new Error("Unsupported figure function: "+token);}
            if(Object.prototype.hasOwnProperty.call(params,token))return params[token];
            if(token.toLowerCase()==="pi")return Math.PI;
          }
          throw new Error("Unsupported figure expression: "+source);
        };
        const power=()=>{let v=primary();while(tokens[at]==="^"){at++;v=Math.pow(v,primary());}return v;};
        const product=()=>{let v=power();while(tokens[at]==="*"||tokens[at]==="/"){const op=tokens[at++],r=power();v=op==="*"?v*r:v/r;}return v;};
        const expression=()=>{let v=product();while(tokens[at]==="+"||tokens[at]==="-"){const op=tokens[at++],r=product();v=op==="+"?v+r:v-r;}return v;};
        const value=expression();if(at!==tokens.length||!Number.isFinite(value))throw new Error("Invalid figure expression: "+source);return value;
      };
      const assignment=/\b([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]\s*:=\s*([^;]+);/g;
      let match;
      while((match=assignment.exec(script))){
        const [,name,index,raw]=match,value=raw.trim(),quoted=/^(['"])([\s\S]*)\1$/.exec(value);
        (arrays[name] ||= Object.create(null))[Number(index)]=quoted?quoted[2]:evaluate(value);
      }
      const indices=Object.keys(arrays.Vx||{}).map(Number).filter(i=>Object.prototype.hasOwnProperty.call(arrays.Vy||{},i)&&Object.prototype.hasOwnProperty.call(arrays.Vz||{},i)).sort((a,b)=>a-b);
      if(!indices.length)return;
      vertices=indices.map(i=>[arrays.Vx[i],arrays.Vy[i],arrays.Vz[i]]);
      for(let i=0;i<6;i++)if(arrays.Colors?.[i]!==undefined)colors[i]=String(arrays.Colors[i]);
    }
    for (const part of Array.from(root.getElementsByTagName("Part"))) {
      const vertexNode = part.getElementsByTagName("Vertices")[0];
      if (!vertexNode) continue;
      vertexNode.removeAttribute("Vectors");
      vertexNode.replaceChildren();
      for (const point of vertices) {
        const add = figureDoc.createElement("Add");
        add.setAttribute("Vector", point.map(v => String(v)).join(";"));
        vertexNode.appendChild(add);
      }
      for (const face of Array.from(part.getElementsByTagName("Face"))) {
        const match = (face.getAttribute("Color") || "").match(/^Colors\[(\d+)\]$/);
        if (match) face.setAttribute("Color", colors[Number(match[1])] || colors[0]);
      }
    }
    scriptNode.remove();
  }

  function attachFigureDocument(doc, figureDoc, targetLoads) {
    const root = figureDoc.documentElement.nodeName.toLowerCase() === "figure"
      ? figureDoc.documentElement
      : figureDoc.getElementsByTagName("Figure")[0] || figureDoc.documentElement;
    expandKnownFigureScript(doc, figureDoc, root);
    // Keep the original pCubes figure structure intact. In particular, Script,
    // Macro, ExecMacro, Circle and Cylinder nodes are meaningful to the Pascal
    // loader and must not be flattened into a small list of hard-coded solids.
    const nodes = Array.from(root.childNodes).filter(n => n.nodeType === 1 && n.nodeName !== "LoadFrom");
    if (!nodes.length) throw new Error("Selected figure XML contains no figure elements.");
    if (!targetLoads || !targetLoads.length) throw new Error("No matching external figure reference was found.");
    for (const load of targetLoads) {
      const parent = load.parentNode;
      for (const node of nodes) parent.insertBefore(doc.importNode(node, true), load);
      parent.removeChild(load);
    }
    return targetLoads.length;
  }

  function figureFileName(path) {
    return String(path || "").replace(/\\/g, "/").split("/").pop().trim().toLowerCase();
  }

  function normalizeFigurePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "").toLowerCase();
  }

  function figurePathMatches(referencePath, selectedPath) {
    const reference = normalizeFigurePath(referencePath);
    const selected = normalizeFigurePath(selectedPath);
    return !!reference && !!selected && (reference === selected ||
      selected.endsWith("/" + reference) || reference.endsWith("/" + selected));
  }

  function matchFigureLoads(unresolved, used, file) {
    const selectedPath = file.webkitRelativePath || file.name;
    const pathMatches = unresolved.filter(load => !used.has(load) &&
      figurePathMatches(load.getAttribute("File"), selectedPath));
    if (pathMatches.length) return pathMatches;
    // A basename is safe only when it identifies exactly one remaining
    // reference. This avoids attaching the wrong XML when different folders
    // contain files with the same name.
    const sameName = unresolved.filter(load => !used.has(load) &&
      figureFileName(load.getAttribute("File")) === figureFileName(file.name));
    return sameName.length === 1 ? sameName : [];
  }

  function inlineFigureIncludes(figureDoc, includeFiles) {
    const scripts = Array.from(figureDoc.getElementsByTagName("Script"));
    const expand = (source, stack, depth) => {
      if (depth > 20) throw new Error("Figure script includes are nested too deeply.");
      return String(source).replace(/\binclude\s+(['"])([^'"]+)\1\s*;?/gi, (_all, _quote, requested) => {
        const key = normalizeFigurePath(requested);
        const base = figureFileName(requested);
        let content = includeFiles.get(key);
        if (content === undefined) {
          const matches = [...includeFiles.entries()].filter(([candidate]) =>
            candidate === base || candidate.endsWith("/" + key));
          if (matches.length > 1)
            throw new Error('Ambiguous figure script include "' + requested + '". The selected folder contains multiple matching files.');
          if (matches.length === 1) content = matches[0][1];
        }
        if (content === undefined) throw new Error('Missing figure script include "' + requested + '". Select the complete figure folder, including its .inc files.');
        if (stack.includes(base)) throw new Error("Circular figure script include: " + [...stack, base].join(" -> "));
        return expand(content, [...stack, base], depth + 1);
      });
    };
    for (const script of scripts) script.textContent = expand(script.textContent || "", [], 0);
  }

  function loadFigureFiles(files) {
    if (!pendingPuzzleDoc) throw new Error("Load the main puzzle XML first.");
    // Include Cube.xml too: when the real figure file is selected, use it.
    // resolveExternalFigures still supplies the small built-in cube fallback
    // when the folder does not contain that optional legacy file.
    const unresolved = Array.from(pendingPuzzleDoc.getElementsByTagName("LoadFrom"));
    if (!unresolved.length) throw new Error("This puzzle has no external figure files to add.");
    const selected = Array.from(files || []);
    if (!selected.length) return false;
    const read = selected.map(async file => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const header = new TextDecoder("windows-1252").decode(bytes.slice(0,256));
      const declared = header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
      const encoding = declared ? declared[1] : "utf-8";
      return { file, text: new TextDecoder(encoding).decode(bytes) };
    });
    return Promise.all(read).then(items => {
      const includeFiles = new Map();
      const figureItems = [];
      for (const item of items) {
        const path = normalizeFigurePath(item.file.webkitRelativePath || item.file.name);
        const base = figureFileName(item.file.name);
        if (/\.inc$/i.test(item.file.name)) {
          includeFiles.set(path, item.text);
        } else if (/\.xml$/i.test(item.file.name)) {
          item.doc = parseXml(item.text);
          const root = item.doc.documentElement.nodeName.toLowerCase() === "figure"
            ? item.doc.documentElement
            : item.doc.getElementsByTagName("Figure")[0] || item.doc.documentElement;
          const figureTags = new Set(["Part", "Script", "Macro", "ExecMacro", "Circle", "Cylinder", "LoadFrom"]);
          const looksLikeFigure = root.nodeName.toLowerCase() === "figure" ||
            Array.from(root.children || []).some(child => figureTags.has(child.nodeName));
          const hasFigureContent = Array.from(root.children || []).some(child => child.nodeName !== "LoadFrom");
          if (looksLikeFigure && hasFigureContent) figureItems.push(item);
        }
      }
      if (!figureItems.length) throw new Error("Select at least one figure .xml file. You can include its .inc script files in the same selection.");
      for (const item of figureItems) {
        const root = item.doc.documentElement.nodeName.toLowerCase() === "figure"
          ? item.doc.documentElement
          : item.doc.getElementsByTagName("Figure")[0] || item.doc.documentElement;
        // Match by the complete relative path first, then use a basename only
        // when it is unambiguous. Each figure gets its own LoadFrom parameters.
        const matching = matchFigureLoads(unresolved, new Set(), item.file);
        const scriptLoad = matching[0] || (unresolved.length === 1 ? unresolved[0] : null);
        expandKnownFigureScript(pendingPuzzleDoc, item.doc, root, scriptLoad);
        inlineFigureIncludes(item.doc, includeFiles);
      }
      let attached = 0;
      const used = new Set();
      for (const item of figureItems) {
        const matching = matchFigureLoads(unresolved, used, item.file);
        if (matching.length) {
          attached += attachFigureDocument(pendingPuzzleDoc, item.doc, matching);
          matching.forEach(load => used.add(load));
        }
      }
      if (figureItems.length === 1 && used.size === 0) {
        const distinctNames = new Set(unresolved.map(load => figureFileName(load.getAttribute("File"))));
        if (distinctNames.size === 1) {
          attached += attachFigureDocument(pendingPuzzleDoc, figureItems[0].doc, unresolved);
          unresolved.forEach(load => used.add(load));
        }
      }
      if (used.size !== unresolved.length) {
        const missing = unresolved.filter(load => !used.has(load))
          .map(load => load.getAttribute("File") || "(unnamed figure)");
        throw new Error("Could not match selected figure files to: " + missing.join(", ") +
          ". Select the corresponding XML files together; their filenames should match the LoadFrom File names.");
      }
      resolveExternalFigures(pendingPuzzleDoc);
      const remaining = Array.from(pendingPuzzleDoc.getElementsByTagName("LoadFrom"));
      if (remaining.length) throw new Error("Some external figure references are still unresolved.");
      pendingPuzzleDoc = parseXml(new XMLSerializer().serializeToString(pendingPuzzleDoc));
      if (!call("loadXML", pendingPuzzleDoc.documentElement)) return false;
      originalXmlText = new XMLSerializer().serializeToString(pendingPuzzleDoc);
      pendingPuzzleDoc = null;
      setFigurePickerEnabled(false);
      status.textContent = "Figure added: " + attached + " external reference(s) from " + figureItems.length + " XML file(s).";
      return true;
    });
  }

  function normalizeNumericExpression(expression) {
    const value = String(expression).trim().replace(/\s+/g, "");
    if (!value) return value;
    const fraction = value.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
    if (fraction) return String(Number(fraction[1]) / Number(fraction[2]));
    const number = Number(value);
    if (Number.isFinite(number)) return String(number);
    const pi = value.match(/^([+-]?)(?:(\d+(?:\.\d+)?)\*?)?Pi(?:\/(\d+(?:\.\d+)?))?$/i);
    if (pi) {
      const coefficient = (pi[1] === "-" ? -1 : 1) * (pi[2] ? Number(pi[2]) : 1);
      return String(coefficient * Math.PI / (pi[3] ? Number(pi[3]) : 1));
    }
    throw new Error('Unsupported numeric expression in browser XML: "' + expression + '". Use decimal numbers or simple fractions.');
  }

  function normalizeNumericList(value) {
    return String(value).split(";").map(normalizeNumericExpression).join(";");
  }

  function resolveExternalFigures(doc) {
    // The desktop XML loader inherits these attributes from <Axes> when
    // reading each <Axis>. The browser DOM bridge can lose that inheritance
    // in the Pascal DOM adapter, so materialize the same inherited values
    // on each axis before handing the document to Pascal. Explicit per-axis
    // values always win, preserving custom puzzle definitions.
    const axesParent = doc.getElementsByTagName("Axes")[0];
    if (axesParent) {
      const numericAttributes = ["PlaneDistances", "TurningAngles", "AvailableAngles",
        "JumbleAngle", "MinAngles", "MaxAngles"];
      for (const name of numericAttributes) {
        if (axesParent.hasAttribute(name) && axesParent.getAttribute(name) !== "")
          axesParent.setAttribute(name, normalizeNumericList(axesParent.getAttribute(name)));
      }
      const inherited = ["PlaneDistances", "TurningAngles", "AvailableAngles",
        "JumbleAngle", "FixedLayers", "MinAngles", "MaxAngles",
        "TurnAxesWithLayer", "TurnAxesWithPartNo"];
      for (const axis of Array.from(axesParent.getElementsByTagName("Axis"))) {
        for (const name of inherited) {
          const parentValue = axesParent.getAttribute(name);
          if (!axis.hasAttribute(name) && parentValue !== null)
            axis.setAttribute(name, parentValue);
          if (numericAttributes.includes(name) && axis.hasAttribute(name) && axis.getAttribute(name) !== "")
            axis.setAttribute(name, normalizeNumericList(axis.getAttribute(name)));
        }
      }
    }
    const loads = Array.from(doc.getElementsByTagName("LoadFrom"));
    // The official Figures/Cube.xml is a single solid. pCubes then applies
    // SplitByAxes using the puzzle's own PlaneDistances. Build that solid
    // directly so custom 2x2, 4x4, and non-cubic layer layouts are preserved.
    for (const node of loads) {
      const path = (node.getAttribute("File") || "").replace(/\\/g, "/").toLowerCase();
      if (path.endsWith("figures/cube.xml") || path === "cube.xml") addBuiltinFigure(node);
    }
    const missing = Array.from(doc.getElementsByTagName("LoadFrom"));
    if (missing.length) {
      const names = [...new Set(missing.map(node => node.getAttribute("File") || "(unnamed figure)"))];
      throw new Error('Missing external figure' + (names.length > 1 ? 's' : '') + ': ' + names.join(", ") + '. Select the matching XML file(s) with Add figure.');
    }
    // AxisLoadFromXml already inherits settings from its parent <Axes>.
  }

  function updateModelInfo(api) {
    const model = api.getModelInfo();
    info.textContent = `Pascal ${api.getVersion()} · model ${model.connected ? "connected" : "offline"} · ${model.parts} parts · ${model.axes} axes · undo ${model.undoCount} · redo ${model.redoCount}`;
    for (const id of controls) $(id).disabled = !model.ready || !preflightPassed;
    $("library").disabled = !preflightPassed;
    $("generator").disabled = !preflightPassed;
    $("load").disabled = false;
    refreshTurnControls(api);
    if (typeof api.getRenderData === "function" && !renderer.deferGeometry) renderer.setGeometry(api.getRenderData());
  }

  function turnLayerAnimated(axisNo, layerNo, direction) {
    const api = window.pCubes;
    if (!api?.getRenderData || !api?.getAxesInfo) return call("turnLayer", axisNo, layerNo, direction);
    const before = api.getRenderData();
    const axis = (api.getAxesInfo() || []).find(item => item.index === axisNo);
    if (!axis) return false;
    const angle = Number(axis.angle) * direction;
    renderer.deferGeometry = true;
    const result = call("turnLayer", axisNo, layerNo, direction);
    renderer.deferGeometry = false;
    if (result) renderer.animateTurn(before, api.getRenderData(), axis, angle, 220, 0, layerNo, 1);
    else renderer.setGeometry(api.getRenderData() || before);
    return result;
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
      const axis = axes.find(item => item.index === oldAxis) || axes[0];
      axisSelect.value = String(axis.index);
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
      else if (result === false) {
        // Keep the detailed Pascal loader error already written to the status node.
        if (!status.textContent || status.textContent === "Running startup tests…")
          status.textContent = "Pascal could not complete this request.";
      }
      updateModelInfo(api); return result !== false;
    } catch (error) {
      let detail;
      try {
        detail = error && (error.message || error.reason) ? (error.message || error.reason) :
          typeof error === "string" ? error : JSON.stringify(error);
      } catch (_) { detail = ""; }
      if (!detail || detail === "{}") detail = String(error);
      status.textContent = "Pascal error: " + (detail && detail !== "[object Object]" ? detail : "Unknown exception (the engine did not provide an error message).");
      console.error("pCubes API exception:", error);
      return false;
    }
  }

  function loadXmlText(xmlText) {
    let doc = parseXml(xmlText);
    // Retain the parsed puzzle even when an external figure is missing, so
    // the Add figure workflow can attach the selected XML and retry loading.
    pendingPuzzleDoc = doc;
    resolveExternalFigures(doc);
    // Reparse the serialized document so the Pascal DOM bridge receives the
    // normalized per-axis attributes as part of the original XML tree, not as
    // post-parse JavaScript DOM mutations.
    doc = parseXml(new XMLSerializer().serializeToString(doc));
    pendingPuzzleDoc = doc;
    if (!call("loadXML", doc.documentElement)) return false;
    originalXmlText = new XMLSerializer().serializeToString(doc);
    pendingPuzzleDoc = null;
    setFigurePickerEnabled(false);
    return true;
  }



  function makeDodecahedronFigureXml() {
    // Regular dodecahedron coordinates matching the official pCubes figure.
    const radius=0.7, angle=(Math.atan(2)+Math.asin(2/3))/2;
    const angle2=(Math.atan(2)-Math.asin(2/3))/2, step=2*Math.PI/5;
    const rs=radius*Math.sin(angle), rc=radius*Math.cos(angle);
    const r2s=radius*Math.sin(angle2), r2c=radius*Math.cos(angle2);
    const vertices=[];
    for(let i=0;i<5;i++)vertices.push([rc*Math.sin(step*(i-.5)),rc*Math.cos(step*(i-.5)),rs]);
    for(let i=5;i<10;i++)vertices.push([r2c*Math.sin(step*(i-.5)),r2c*Math.cos(step*(i-.5)),r2s]);
    for(let i=10;i<15;i++)vertices.push([r2c*Math.sin(step*i),r2c*Math.cos(step*i),-r2s]);
    for(let i=15;i<20;i++)vertices.push([rc*Math.sin(step*i),rc*Math.cos(step*i),-rs]);
    const faces=[
      [4,3,2,1,0],[0,1,6,10,5],[1,2,7,11,6],[2,3,8,12,7],[3,4,9,13,8],[4,0,5,14,9],
      [18,17,12,8,13],[19,18,13,9,14],[15,19,14,5,10],[16,15,10,6,11],[17,16,11,7,12],[15,16,17,18,19]
    ];
    const colors=["FFFF00","00FF00","FF0080","0000A0","FF0000","800000","008000","800080","3868BF","FF6000","00DCB4","FFFFFF"];
    const esc=s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;");
    return "<xml><Part><Vertices>"+vertices.map(v=>'<Add Vector="'+esc(v.map(n=>n.toFixed(12)).join(";"))+'"/>').join("")+
      "</Vertices><Faces>"+faces.map((f,i)=>'<Face Color="'+colors[i]+'" VertexIndexes="'+f.join(";")+'"/>').join("")+
      "</Faces></Part></xml>";
  }

  async function loadPuzzleWithFigures(xmlText, suppliedFigures = {}) {
    let doc = parseXml(xmlText);
    pendingPuzzleDoc = doc;
    const loads = Array.from(doc.getElementsByTagName("LoadFrom"));
    if (!loads.length) {
      resolveExternalFigures(doc);
      doc = parseXml(new XMLSerializer().serializeToString(doc));
      if (!call("loadXML", doc.documentElement)) throw new Error(status.textContent || "Pascal rejected the puzzle.");
      originalXmlText = new XMLSerializer().serializeToString(doc);
      pendingPuzzleDoc = null; setFigurePickerEnabled(false); return true;
    }
    const files = [];
    for (const load of loads) {
      const ref = String(load.getAttribute("File") || "").replace(/\\/g, "/");
      const base = ref.split("/").pop();
      let figureText = Object.entries(suppliedFigures).find(([path]) => path.toLowerCase().split("/").pop() === base.toLowerCase())?.[1];
      if (!figureText) {
        const match = (remoteLibrary?.figures || []).find(path => path.split("/").pop().toLowerCase() === base.toLowerCase());
        if (match) {
          const response = await fetch("https://raw.githubusercontent.com/brianthanhbinh/webcube-library/main/" + match.split("/").map(encodeURIComponent).join("/"));
          if (!response.ok) throw new Error("Could not fetch figure " + match);
          figureText = await response.text();
        }
      }
      if (!figureText && base.toLowerCase() === "dodecahedron.xml")
        figureText = makeDodecahedronFigureXml();
      if (!figureText) throw new Error('Required figure "' + base + '" was not found.');
      const f = new File([figureText], base, {type:"application/xml"});
      Object.defineProperty(f, "webkitRelativePath", {value:"Figures/" + base});
      files.push(f);
    }
    if (!await loadFigureFiles(files)) throw new Error(status.textContent || "Could not attach generated figures.");
    return true;
  }

  async function loadRemoteEntry(entry) {
    status.textContent = "Fetching " + entry.path + "…";
    const result = await fetchRemotePuzzle(entry, remoteLibrary);
    await loadPuzzleWithFigures(result.xml, result.figures);
  }

  function supported(entry) {
    // External figures are resolved through Add figure after selecting a
    // library puzzle, so library availability is not tied to known filenames.
    parseXml(entry.xml);
    return true;
  }

  async function showLibrary() {
    const dialog=$("library-dialog"), list=$("library-list"), search=$("library-search");
    list.textContent="Loading library…"; dialog.showModal();
    try {
      libraryData ||= await loadBuiltinLibrary();
      remoteLibrary ||= await loadRemoteLibraryIndex();
      const draw=()=>{
        const query=search.value.trim().toLowerCase(); list.replaceChildren();
        const entries=[
          ...libraryData.puzzles.map(entry=>({...entry,source:"builtin",label:entry.menu||entry.path})),
          ...remoteLibrary.puzzles.map(entry=>({...entry,source:"remote",label:entry.path}))
        ];
        for(const entry of entries){
          if(!(entry.name+" "+entry.label).toLowerCase().includes(query)) continue;
          const button=document.createElement("button"); button.className="library-item"; button.type="button";
          const title=document.createElement("strong"); title.textContent=entry.name;
          const meta=document.createElement("small"); meta.textContent=(entry.source==="remote"?"webcube-library / ":"Built-in / ")+entry.label;
          button.append(title,meta);
          if(entry.source==="builtin"){
            if(!supported(entry)){button.disabled=true;button.title="Invalid XML entry.";}
            else button.addEventListener("click",()=>{try{if(loadXmlText(entry.xml))dialog.close();}catch(error){setFigurePickerEnabled(!!pendingPuzzleDoc);status.textContent="Library load failed: "+error.message;}});
          } else button.addEventListener("click",async()=>{
            button.disabled=true;
            try{await loadRemoteEntry(entry);dialog.close();}
            catch(error){setFigurePickerEnabled(!!pendingPuzzleDoc);status.textContent="Library load failed: "+error.message;button.disabled=false;}
          });
          list.appendChild(button);
        }
        if(!list.children.length) list.textContent="No matching puzzles.";
      };
      search.oninput=draw; draw();
    } catch(error){list.textContent="Library failed to load: "+error.message;}
  }

  $("turn-axis").addEventListener("change", () => refreshTurnControls(window.pCubes));
  $("turn-ccw").addEventListener("click", () => turnLayerAnimated(Number($("turn-axis").value), Number($("turn-layer").value), -1));
  $("turn-cw").addEventListener("click", () => turnLayerAnimated(Number($("turn-axis").value), Number($("turn-layer").value), 1));
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
  $("add-figure").addEventListener("click", () => figureFile.click());
  $("load-figure-folder").addEventListener("click", () => figureFolder.click());
  async function handleFigureSelection(input, label) {
    const selected = input.files; if (!selected || !selected.length) return;
    try {
      await loadFigureFiles(selected);
    } catch (error) {
      setFigurePickerEnabled(!!pendingPuzzleDoc);
      status.textContent = label + " failed: " + error.message;
    } finally { input.value = ""; }
  }
  figureFile.addEventListener("change", () => handleFigureSelection(figureFile, "Add figure"));
  figureFolder.addEventListener("change", () => handleFigureSelection(figureFolder, "Figure folder scan"));
  file.addEventListener("change", async () => {
    const selected = file.files && file.files[0]; if (!selected) return;
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const header = new TextDecoder("windows-1252").decode(bytes.slice(0,256));
      const declared = header.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
      const encoding = declared ? declared[1] : "utf-8";
      let xml = new TextDecoder(encoding).decode(bytes);
      xml = xml.replace(/(<\?xml[^>]*?)\s+encoding\s*=\s*(["'])[^"']+\2/i, "$1");
      try { loadXmlText(xml); }
      catch (error) {
        setFigurePickerEnabled(!!pendingPuzzleDoc);
        status.textContent = "XML needs a figure: " + error.message;
      }
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

  $("generator").addEventListener("click",()=>$("generator-dialog").showModal());
  $("generator-close").addEventListener("click",()=>$("generator-dialog").close());
  $("generator-type").addEventListener("change",()=>{
    const kind=$("generator-type").value;
    const hints={cube:"One number, e.g. 4.",cuboid:"Dimensions, e.g. 2x3x4.",cylinder:"Grid and height, e.g. 3x4 or 3x3x4.",sphere:"Dimensions, e.g. 3x3x4.",mirror:"One number, e.g. 5.",pyraminx:"One number, e.g. 4.",minx:"3 Megaminx, 5 Gigaminx, 7 Teraminx, 9 Petaminx."};
    $("generator-help").textContent=hints[kind];
    $("generator-size").value=(kind==="cuboid"||kind==="sphere")?"3x3x3":kind==="cylinder"?"3x3x3":"3";
  });
  $("generator-create").addEventListener("click",async()=>{
    const kind=$("generator-type").value,spec=$("generator-size").value.trim(),out=$("generator-status"),button=$("generator-create");
    if(!spec){out.textContent="Enter a size first.";return;}
    button.disabled=true;out.textContent="Starting browser Python runtime…";
    try{
      const generated=await generatePuzzle(kind,spec,message=>{out.textContent=message;});
      out.textContent="Attaching generated geometry and loading into the Pascal game…";
      if(!remoteLibrary) remoteLibrary=await loadRemoteLibraryIndex();
      await loadPuzzleWithFigures(generated.xml,generated.figures);
      $("generator-dialog").close();status.textContent="Generated and loaded: "+generated.name;
    }catch(error){out.textContent="Generator failed: "+(error?.message||String(error));}
    finally{button.disabled=false;}
  });

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
    const wrappedXml = parseXml("Imported from a library:\\n```xml\\n<?xml version='1.0' encoding='UTF-8'?><xml><Name><![CDATA[A > B]]></Name></xml>\\n``` trailing metadata");
    recordTest("General XML wrappers and trailing content", wrappedXml.getElementsByTagName("Name")[0]?.textContent === "A > B");
    const doctypeXml = parseXml("<!DOCTYPE xml [<!ENTITY label 'Universal'>]><xml><Name>&label;</Name></xml> extra");
    recordTest("XML doctype and entities", doctypeXml.getElementsByTagName("Name")[0]?.textContent === "Universal");
    const emptyXml = parseXml("prefix <xml/> suffix");
    recordTest("Self-closing XML root", emptyXml.documentElement.nodeName === "xml");
    resolveExternalFigures(cubeDoc);
    const axesXml = Array.from(cubeDoc.getElementsByTagName("Axes")[0]?.getElementsByTagName("Axis") || []);
    const inheritedPlanes = axesXml.map(axis => axis.getAttribute("PlaneDistances"));
    recordTest("Axis XML inherited settings", axesXml.length >= 3 &&
      inheritedPlanes.every(value => {
        const numbers = value.split(";").map(Number);
        return numbers.length === 2 && Math.abs(numbers[0] + 1/6) < 1e-9 && Math.abs(numbers[1] - 1/6) < 1e-9;
      }), JSON.stringify(inheritedPlanes));
    const cubeLoaded = loadXmlText(cube.xml);
    recordTest("Pascal loadXML", cubeLoaded, status.textContent);
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
