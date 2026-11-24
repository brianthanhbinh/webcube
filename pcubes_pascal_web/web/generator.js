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
 if(kind==="minx")await fetchFigure(py,"megaminx_figure.xml");
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
 fp=os.path.join(base,"Figures","megaminx_figure.xml")
 if not os.path.isfile(fp):raise FileNotFoundError("Missing Figures/megaminx_figure.xml")
 figures["Figures/megaminx_figure.xml"]=open(fp,encoding="utf-8").read()
json.dumps({"name":name,"xml":xml,"figures":figures})
`;
 return JSON.parse(await py.runPythonAsync(code));
}
