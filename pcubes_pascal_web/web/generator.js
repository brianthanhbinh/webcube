const REPO="https://raw.githubusercontent.com/brianthanhbinh/webcube-library/main/generators/";
const FIGURE_REPO="https://raw.githubusercontent.com/brianthanhbinh/webcube-library/main/figures/";
const PYODIDE_BASE="https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let runtimePromise;
async function getRuntime(onStatus){
 if(!runtimePromise) runtimePromise=(async()=>{
  if(!window.loadPyodide) await new Promise((resolve,reject)=>{
   const s=document.createElement("script");s.src=PYODIDE_BASE+"pyodide.js";s.onload=resolve;s.onerror=()=>reject(new Error("Could not load browser Python runtime."));document.head.appendChild(s);
  });
  onStatus?.("Loading Python runtime (first use may take a little while)…");
  return window.loadPyodide({indexURL:PYODIDE_BASE});
 })();
 return runtimePromise;
}
async function fetchScript(py,name){
 const r=await fetch(REPO+name);if(!r.ok)throw new Error("Generator source not found: "+name);
 const base="/home/pyodide/webcube_generators";try{py.FS.mkdirTree(base);}catch(_){}
 py.FS.writeFile(base+"/"+name,await r.text());
}
async function fetchFigure(py,name){
 const r=await fetch(FIGURE_REPO+encodeURIComponent(name));if(!r.ok)throw new Error("Reference figure not found: "+name);
 const base="/home/pyodide/webcube_generators/Figures";try{py.FS.mkdirTree(base);}catch(_){}
 py.FS.writeFile(base+"/"+name,await r.text());
}
export async function generatePuzzle(kind,spec,onStatus){
 const scripts={cube:["cubes.py"],cuboid:["cuboid.py"],cylinder:["cylinder.py"],sphere:["sphere.py"],mirror:["mirror.py"],pyraminx:["pyraminx.py"],minx:["minx.py","gen_megaminx_figure.py"]};
 if(!scripts[kind])throw new Error("Unknown generator.");
 const py=await getRuntime(onStatus);onStatus?.("Downloading official "+kind+" generator…");
 for(const s of scripts[kind])await fetchScript(py,s);
 if(kind==="minx")await fetchFigure(py,"Dodecahedron.xml");
 const base="/home/pyodide/webcube_generators";
 py.runPython("import os,sys,importlib.util\nos.chdir("+JSON.stringify(base)+")\nsys.path.insert(0,"+JSON.stringify(base)+")");
 py.globals.set("webcube_kind",kind);py.globals.set("webcube_spec",spec);
 const code=String.raw`
import os,sys,json,importlib.util
base=os.getcwd();kind=webcube_kind;spec=webcube_spec
def load_module(filename,module_name):
 p=os.path.join(base,filename);ns={"__name__":module_name,"__file__":p}
 exec(compile(open(p,encoding="utf-8").read(),p,"exec"),ns);return ns
figures={}
if kind=="cube":
 m=load_module("cubes.py","webcube_cubes");n=int(spec)
 if n<2 or n>25:raise ValueError("Cube size must be from 2 to 25.")
 name=f"{n}x{n}x{n} Cube";xml=m["generate_pcube_xml"](n,None)
elif kind=="cuboid":
 m=load_module("cuboid.py","webcube_cuboid");dims=m["parse"](spec)
 if max(dims)>25:raise ValueError("Cuboid dimensions must be 25 or less.")
 name,xml=m["make_xml"](dims);figures["Figures/Cuboid.xml"]=m["figure_xml"]()
elif kind=="cylinder":
 m=load_module("cylinder.py","webcube_cylinder");g,layers=m["parse"](spec)
 if max(g,layers)>20:raise ValueError("Cylinder dimensions must be 20 or less.")
 name,xml=m["make_xml"](g,layers);figures["Figures/Cylinder.xml"]=m["figure_xml"]()
elif kind=="sphere":
 m=load_module("sphere.py","webcube_sphere");dims=m["parse"](spec)
 if max(dims)>12:raise ValueError("Sphere dimensions are limited to 12 for browser performance.")
 detail=int(m["DETAIL"]);figpath=f"Figures\\Sphere mesh {detail}.xml"
 name,xml=m["make_xml"](dims,figpath);figures[figpath.replace("\\","/")]=m["figure_xml"](detail)
elif kind=="mirror":
 m=load_module("mirror.py","webcube_mirror");n=int(spec)
 if n<2 or n>20:raise ValueError("Mirror size must be from 2 to 20.")
 m["generate_mirror_xml"](n,0.5);name=f"Mirror Cube {n}x{n}x{n}"
 xml=open(f"Mirror_{n}x{n}x{n}.xml",encoding="utf-8").read()
elif kind=="pyraminx":
 m=load_module("pyraminx.py","webcube_pyraminx");n=int(spec)
 if n<2 or n>20:raise ValueError("Pyraminx layers must be from 2 to 20.")
 cuts=m["format_distances"](m["calc_even_cuts"](layers=n,start=0.1,end=0.58))
 xml=m["build_pyraminx_xml"](layers=n,distances_str=cuts,w=0.5);name=f"Pyraminx {n}x{n}"
elif kind=="minx":
 m=load_module("minx.py","webcube_minx");n=int(spec)
 if n<2 or n>15:raise ValueError("Dodecahedral layers must be from 2 to 15.")
 name,xml,_=m["make_xml"](n)
 # Use the exact reference figure from the library repository. The
 # puzzle XML produced by minx.py points to this filename.
 fp=os.path.join(base,"Figures","Dodecahedron.xml")
 if not os.path.isfile(fp):raise FileNotFoundError("Missing Figures/Dodecahedron.xml")
 figures["Figures/Dodecahedron.xml"]=open(fp,encoding="utf-8").read()
json.dumps({"name":name,"xml":xml,"figures":figures})
`;
 return JSON.parse(await py.runPythonAsync(code));
}


// User-authored .figure files are stored only in this browser's IndexedDB.
const CUSTOM_DB="pcubes-custom-generators";
const CUSTOM_STORE="generators";
let customDbPromise;
function openCustomDb(){
 if(!("indexedDB" in window))return Promise.reject(new Error("This browser does not support local generator storage."));
 if(!customDbPromise)customDbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(CUSTOM_DB,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(CUSTOM_STORE))db.createObjectStore(CUSTOM_STORE,{keyPath:"id"});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("Could not open local generator storage."));
 });
 return customDbPromise;
}
function storeRequest(mode,operation){
 return openCustomDb().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction(CUSTOM_STORE,mode),store=tx.objectStore(CUSTOM_STORE);
  let request;
  try{request=operation(store);}catch(error){reject(error);return;}
  if(request){request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("Local generator storage failed."));}
  else{tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||new Error("Local generator storage failed."));}
 }));
}
export async function listCustomGenerators(){
 const rows=await storeRequest("readonly",store=>store.getAll());
 return (rows||[]).sort((a,b)=>b.updatedAt-a.updatedAt).map(({id,name,updatedAt})=>({id,name,updatedAt}));
}
export async function saveCustomGenerator(file){
 if(!file||!String(file.name||"").toLowerCase().endsWith(".figure"))throw new Error("Choose a Python generator file with the .figure extension.");
 const name=String(file.name).split("/").pop().split("\\").pop().trim();
 if(!name||name.length>120)throw new Error("Generator filename must be 1–120 characters.");
 const source=await file.text();
 if(!source.trim())throw new Error("The .figure file is empty.");
 if(source.length>512*1024)throw new Error("Custom generator files must be 512 KB or smaller.");
 const id=name.toLowerCase();
 await storeRequest("readwrite",store=>store.put({id,name,source,updatedAt:Date.now()}));
 return {id,name};
}
export async function deleteCustomGenerator(id){
 if(!id)return false;
 await storeRequest("readwrite",store=>store.delete(String(id)));
 return true;
}
async function getCustomGenerator(id){
 const row=await storeRequest("readonly",store=>store.get(String(id)));
 if(!row)throw new Error("That saved generator no longer exists.");
 return row;
}
export async function generateCustomPuzzle(id,spec,onStatus){
 const record=await getCustomGenerator(id);
 const py=await getRuntime(onStatus);
 onStatus?.("Running "+record.name+" in the browser's Python runtime…");
 py.globals.set("webcube_custom_source",record.source);
 py.globals.set("webcube_custom_filename",record.name);
 py.globals.set("webcube_custom_spec",String(spec??""));
 const code=[
  "import json",
  'namespace={"__name__":"__webcube_custom_generator__","__file__":webcube_custom_filename}',
  'exec(compile(webcube_custom_source,webcube_custom_filename,"exec"),namespace)',
  'entry=namespace.get("generate_puzzle") or namespace.get("generate")',
  'if not callable(entry): raise ValueError("Your .figure file must define generate(spec) or generate_puzzle(spec).")',
  'result=entry(webcube_custom_spec)',
  'if isinstance(result,str): result={"xml":result}',
  'if not isinstance(result,dict): raise TypeError("The generator must return an XML string or a dictionary.")',
  'if not isinstance(result.get("xml"),str) or not result["xml"].strip(): raise ValueError("The generator result must include a non-empty xml string.")',
  'if "figures" not in result: result["figures"]={}',
  'if not isinstance(result["figures"],dict): raise TypeError("figures must be a dictionary of filenames to XML strings.")',
  'if any(not isinstance(k,str) or not isinstance(v,str) for k,v in result["figures"].items()): raise TypeError("Every figure entry must map a filename to XML text.")',
  'json.dumps({"name":str(result.get("name") or webcube_custom_filename.rsplit(".",1)[0]),"xml":result["xml"],"figures":result["figures"]},ensure_ascii=False)'
 ].join("\n");
 const generated=JSON.parse(await py.runPythonAsync(code));
 if(generated.xml.length>10*1024*1024)throw new Error("Generated puzzle XML is larger than 10 MB.");
 for(const [name,xml] of Object.entries(generated.figures||{})){
  const normalized=String(name).split("\\").join("/");
  if(normalized.startsWith("/")||normalized.split("/").includes(".."))throw new Error("Figure filenames must stay inside the puzzle folder: "+name);
  if(typeof xml!=="string"||xml.length>10*1024*1024)throw new Error("Invalid or oversized figure: "+name);
 }
 return generated;
}
