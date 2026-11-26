const INDEX="https://raw.githubusercontent.com/brianthanhbinh/webcube-library/main/index.json";
const RAW="https://raw.githubusercontent.com/brianthanhbinh/webcube-library/main/";
const enc=p=>p.split("/").map(encodeURIComponent).join("/");
let cached;
export async function loadRemoteLibraryIndex(){
 if(!cached)cached=(async()=>{
  // Use raw.githubusercontent.com rather than the GitHub API: the API is
  // rate-limited/403 in browser CI and can make the entire library disappear.
  const r=await fetch(INDEX,{cache:"no-store"});
  if(!r.ok)throw new Error("Could not read webcube-library index ("+r.status+").");
  const data=await r.json();
  if(!Array.isArray(data.files))throw new Error("webcube-library index is malformed.");
  const files=data.files.filter(p=>typeof p==="string"&&p.toLowerCase().endsWith(".xml"));
  const figures=files.filter(p=>p.toLowerCase().startsWith("figures/"));
  const puzzles=files.filter(p=>!p.toLowerCase().startsWith("figures/")&&!p.toLowerCase().startsWith("generators/"))
   .map(path=>({path,name:path.split("/").pop().replace(/\\.xml$/i,""),menu:path.split("/").slice(0,-1).join("/")||"Root"}))
   .sort((a,b)=>a.path.localeCompare(b.path));
  return {puzzles,figures};
 })();
 return cached;
}
export async function fetchRemotePuzzle(entry,index){
 const r=await fetch(RAW+enc(entry.path));if(!r.ok)throw new Error("Could not fetch "+entry.path+" ("+r.status+").");
 const xml=await r.text(),doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.getElementsByTagName("parsererror")[0])throw new Error("Malformed puzzle XML: "+entry.path);
 const figures={};
 for(const load of Array.from(doc.getElementsByTagName("LoadFrom"))){
  const name=String(load.getAttribute("File")||"").replace(/\\/g,"/").split("/").pop();
  const path=index.figures.find(p=>p.split("/").pop().toLowerCase()===name.toLowerCase());
  if(path&&!figures[path]){
   const fr=await fetch(RAW+enc(path));if(!fr.ok)throw new Error("Could not fetch figure "+path+" ("+fr.status+").");
   figures[path]=await fr.text();
  }
 }
 return {xml,figures};
}
