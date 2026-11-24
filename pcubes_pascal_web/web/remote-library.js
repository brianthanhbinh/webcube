const API="https://api.github.com/repos/brianthanhbinh/webcube-library/git/trees/main?recursive=1";
const RAW="https://raw.githubusercontent.com/brianthanhbinh/webcube-library/main/";
const enc=p=>p.split("/").map(encodeURIComponent).join("/");
let cached;
export async function loadRemoteLibraryIndex(){
 if(!cached)cached=(async()=>{
  const r=await fetch(API,{headers:{Accept:"application/vnd.github+json"}});if(!r.ok)throw new Error("Could not read webcube-library ("+r.status+").");
  const data=await r.json(),files=(data.tree||[]).filter(x=>x.type==="blob"&&/\.xml$/i.test(x.path));
  const figures=files.filter(x=>x.path.toLowerCase().startsWith("figures/")).map(x=>x.path);
  const puzzles=files.filter(x=>!x.path.toLowerCase().startsWith("figures/")&&!x.path.toLowerCase().startsWith("generators/"))
   .map(x=>({path:x.path,name:x.path.split("/").pop().replace(/\.xml$/i,""),menu:x.path.split("/").slice(0,-1).join("/")||"Root"})).sort((a,b)=>a.path.localeCompare(b.path));
  return {puzzles,figures};
 })();return cached;
}
export async function fetchRemotePuzzle(entry,index){
 const r=await fetch(RAW+enc(entry.path));if(!r.ok)throw new Error("Could not fetch "+entry.path);
 const xml=await r.text(),doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.getElementsByTagName("parsererror")[0])throw new Error("Malformed puzzle XML: "+entry.path);
 const figures={};
 for(const load of Array.from(doc.getElementsByTagName("LoadFrom"))){
  const name=String(load.getAttribute("File")||"").replace(/\\/g,"/").split("/").pop();
  const path=index.figures.find(p=>p.split("/").pop().toLowerCase()===name.toLowerCase());
  if(path){const fr=await fetch(RAW+enc(path));if(!fr.ok)throw new Error("Could not fetch figure "+path);figures[path]=await fr.text();}
 }
 return {xml,figures};
}
