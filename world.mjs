// Physical building model: metric architecture, objects, colliders, vertical circulation and
// spatial queries. The navigation grid stays at 1 m (cell keys "x,z,floor"); collision,
// visibility and sensing use continuous 3D axis-aligned boxes. The floor plan, room programme
// and furnishing rules live in building.mjs.
import {makeObject,localBoxToWorld,ROT} from './catalog.mjs?v=20261112v';
import {W,D,FLOORS,H,CEILING,EXT_WALL,INT_WALL,DOOR_CLEAR,LINKS,FLOOR_NAMES,linkServes,flightPath,liftPath,buildProgramme,wallBoxes,ENTRANCE} from './building.mjs?v=20261112v';
import {defaultGenome,ZONE_KINDS} from './env.mjs?v=20261112v';
export {W,D,FLOORS,H,CEILING,EXT_WALL,INT_WALL,DOOR_CLEAR,LINKS,FLOOR_NAMES,linkServes};

export const NAV_BAND=[.03,1.0];            // obstacle heights that intersect the robot body
export const EYE={robot:.95,human:1.55,cat:.3,dog:.45};
export const key=(x,z,f)=>`${Math.round(x)},${Math.round(z)},${f}`;
export const point=k=>{const [x,z,f]=k.split(',').map(Number);return {x,z,f};};
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.f-b.f)*H);
export const floorLabel=f=>`L${f+1}`;
const ZONE_NAMES={desks:'Workstation cluster',bench:'Bench desks',lockers:'Lockers',meeting:'Meeting table',print:'Print station',supplies:'Supply storage',reception:'Reception desk',waiting:'Waiting area',lounge:'Lounge seating',booths:'Focus booths',exec:'Executive desk',meet:'Small meeting area',racks:'Server rack row',it:'IT workbench',library:'Library wall',dining:'Café tables',counter:'Countertop area',cold:'Cold storage',island:'High table',waste:'Waste station',cleaning:'Cleaning supplies',toilet:'Toilet stalls',grooming:'Washbasins',cardio:'Cardio area',strength:'Strength area',charging:'Charging zone',recycling:'Recycling station'};
const SPILL_TYPES=new Set(['pantry','reception','restroom','lounge']);

// Vertical links indexed by their landing cell on every served floor.
export const LINK_AT=new Map();for(const l of LINKS)for(let f=l.floors[0];f<=l.floors[1];f++)LINK_AT.set(key(l.landing.x,l.landing.z,f),l);
export const linkById=id=>LINKS.find(l=>l.id===id);
// Floors reachable in one traversal from floor f.
export function linkTargets(l,f){if(!linkServes(l,f))return [];if(l.kind==='stair')return [f-1,f+1].filter(g=>linkServes(l,g));const out=[];for(let g=l.floors[0];g<=l.floors[1];g++)if(g!==f)out.push(g);return out;}
export const linkCost=(l,from,to)=>l.kind==='stair'?14*Math.abs(to-from):8+3*Math.abs(to-from);

export function createWorld(genome=defaultGenome()){
 const {rooms:plan,specs,windows:WIN}=buildProgramme();const DOCK=genome.dock,RECYCLING=genome.bin,openLinks=LINKS.filter(l=>genome.links?.[l.id]!==false);
 const rooms=plan.map(r=>({...r,light:true,temp:+(20.5+((r.f*7+r.idx*3)%11)*.6).toFixed(1),lastSample:null,door:r.kind==='room'?`door-${r.f}-${r.idx}`:undefined}));
 const roomById=new Map(rooms.map(r=>[r.id,r]));
 const objects=[],zones=[],doors=[],windows=[];
 for(const s of specs){const o=makeObject(s.spec,{f:s.f,room:s.room});if(o.type==='hub'){o.id=`hub-${s.room}`;o.needsAccess=true;}if(o.id.startsWith('furniture-'))o.needsAccess=true;objects.push(o);}
 for(const r of rooms){if(r.kind!=='room')continue;const inward=r.doorWall==='S'?-1:1,rot=r.doorWall==='S'?ROT.N:ROT.S;
  r.doors.forEach((x,k)=>{const id=k?`door-${r.f}-${r.idx}-${k+1}`:`door-${r.f}-${r.idx}`,z=r.doorZ;
   const door={...makeObject(['door',id,`${r.name} door${r.doors.length>1?` ${k+1}`:''}`,x,z,rot,.92,.04,2.05,{solid:false}],{f:r.f,room:r.id}),id,open:true,locked:false,exterior:false,hinge:{x:x-.46,z},swing:inward,connects:[r.id,r.corridor],access:[{x,z:z+inward},{x,z:z-inward}],glass:['meeting','office','reception'].includes(r.type)};
   door.parts=[{id:`${id}:leaf`,level:'object',kind:'door-leaf',name:'Door leaf',joint:'revolute',hinge:'west',axis:[0,1,0],limit:[0,Math.PI/2],children:[{id:`${id}:handle`,level:'part',kind:'handle',name:'Lever handle',grasp:{p:null,approach:null}},{id:`${id}:hinge`,level:'part',kind:'hinge',name:'Hinge set'}]}];
   doors.push(door);objects.push(door);});
  // Litter in every room and floor spills in the wet / busy rooms (placed on reachable cells below).
  objects.push({...makeObject(['trash',`trash-${r.f}-${r.idx}`,`${r.name} litter`,r.x,r.z,0,.3,.25,.12,{solid:false}],{f:r.f,room:r.id}),id:`trash-${r.f}-${r.idx}`,active:true,placeOnFloor:true});
  if(SPILL_TYPES.has(r.type)||r.idx%4===1)objects.push({...makeObject(['surface',`surface-${r.f}-${r.idx}`,`${r.name} floor spill`,r.x,r.z,0,.7,.55,.004,{solid:false}],{f:r.f,room:r.id}),id:`surface-${r.f}-${r.idx}`,active:true,placeOnFloor:true});
 }
 const lobby=rooms.find(r=>r.f===0&&r.name===ENTRANCE.room);
 const front={...makeObject(['door','door-0-front','Front door',ENTRANCE.x,D,ROT.S,.92,.05,2.1,{solid:false}],{f:0,room:lobby.id}),id:'door-0-front',name:'Main entrance',open:false,locked:true,exterior:true,hinge:{x:ENTRANCE.x-.46,z:D},swing:-1,connects:[lobby.id,'outside'],access:[{x:ENTRANCE.x,z:D-1}],glass:true};
 front.parts=[{id:'door-0-front:leaf',level:'object',kind:'door-leaf',name:'Door leaf',joint:'revolute',children:[{id:'door-0-front:handle',level:'part',kind:'handle',name:'Lever handle'},{id:'door-0-front:lock',level:'part',kind:'lock',name:'Deadbolt'}]}];
 doors.push(front);objects.push(front);
 objects.push(
  {...makeObject(['dock','dock','Charging dock',DOCK.x,8+INT_WALL/2+.165,ROT.S,.6,.33,.35,{zone:'charging'}],{f:DOCK.f,room:`corridor-${DOCK.f}-n`}),id:'dock',access:{x:DOCK.x,z:9}},
  {...makeObject(['bin','bin','Recycling station',RECYCLING.x,22-INT_WALL/2-.25,ROT.N,.7,.5,.9,{zone:'recycling'}],{f:RECYCLING.f,room:`corridor-${RECYCLING.f}-s`}),id:'bin',access:{x:RECYCLING.x,z:21}});
 for(const l of openLinks)for(let f=l.floors[0];f<=l.floors[1];f++){const corridor=l.landing.z<15?`corridor-${f}-n`:`corridor-${f}-s`,type=l.kind==='lift'?'elevator':'stairs';
  objects.push({...makeObject([type,`${l.id}-${f}`,`${l.name} · L${f+1} ${l.kind==='lift'?'lift lobby':'landing'}`,l.landing.x,l.landing.z,0,.9,.9,.01,{solid:false}],{f,room:corridor}),id:`${l.id}-${f}`,link:l.id,access:{x:l.landing.x,z:l.landing.z}});}
 WIN.forEach(([f,side,along,width,sill,head,room],k)=>{const x=side==='N'||side==='S'?along:side==='W'?0:W,z=side==='W'||side==='E'?along:side==='N'?0:D;
  const rot={N:ROT.S,S:ROT.N,W:ROT.E,E:ROT.W}[side];const o={...makeObject(['window',`window-${f}-${k}`,`${roomById.get(room).name} window`,x,z,rot,width,.08,head-sill,{y:sill,solid:false}],{f,room}),id:`window-${f}-${k}`,side,sill,head,width};windows.push(o);objects.push(o);});
 for(const o of objects){if(!o.zone)continue;let z=zones.find(z=>z.id===o.zone);if(!z){const k=o.zone.split(':zone-')[1];z={id:o.zone,name:ZONE_NAMES[k]??k,room:o.room,f:o.f,members:[]};zones.push(z);}z.members.push(o.id);}

 for(const id of genome.closedDoors??[]){const d=doors.find(d=>d.id===id);if(d)d.open=false;}
 // Hindrance / affordance regions painted on the floor (from the genome, plus dynamic ones).
 const areas=(genome.zones??[]).map(z=>({...z,...ZONE_KINDS[z.kind],kind:z.kind}));
 const world={rooms,objects,zones,doors,windows,links:openLinks,linkOpen:new Set(openLinks.map(l=>l.id)),genome,areas,version:0,areaVersion:0,walls:new Set()};
 world.areaAt=(x,z,f)=>{let best=null;for(const a of areas)if(a.f===f&&x>=a.x0&&x<=a.x1&&z>=a.z0&&z<=a.z1&&(!best||Math.abs(1-a.speed)>Math.abs(1-best.speed)||a.reveal))best=a;return best;};
 world.addArea=a=>{const z={...a,...ZONE_KINDS[a.kind],kind:a.kind};areas.push(z);world.areaVersion++;return z;};
 world.removeArea=id=>{const i=areas.findIndex(a=>a.id===id);if(i>=0){areas.splice(i,1);world.areaVersion++;}};
 const staticWalls=Array.from({length:FLOORS},(_,f)=>wallBoxes(f)).flat().map((b,i)=>({...b,id:`wall-${b.f}-${i}`,owner:null,type:'wall'}));
 world.wallBoxes=staticWalls;
 const byId=new Map(objects.map(o=>[o.id,o]));world.byId=byId;
 world.object=id=>byId.get(id);world.room=id=>roomById.get(id);

 // ---- colliders and a 1 m spatial hash per floor (spatial partitioning for all queries) ----
 world.doorColliders=d=>{const t=.04,leaf=.92;if(!d.open){return d.exterior?[{x0:d.x-.5,x1:d.x+.5,z0:d.z-.06,z1:d.z+.06}]:[{x0:d.x-.46,x1:d.x+.46,z0:d.z-t/2,z1:d.z+t/2}];}
  const z0=d.swing<0?d.z-INT_WALL/2-leaf:d.z+INT_WALL/2,z1=d.swing<0?d.z-INT_WALL/2:d.z+INT_WALL/2+leaf;return [{x0:d.hinge.x,x1:d.hinge.x+t,z0,z1}];};
 const staticWallCells=new Set();for(let f=0;f<FLOORS;f++){const ws=staticWalls.filter(w=>w.f===f);for(let x=0;x<=W;x++)for(let z=0;z<=D;z++)if(ws.some(w=>x>=w.x0-1e-9&&x<=w.x1+1e-9&&z>=w.z0-1e-9&&z<=w.z1+1e-9))staticWallCells.add(key(x,z,f));}
 function build(){
  const list=[...staticWalls];
  for(const d of doors){for(const c of world.doorColliders(d))list.push({...c,y0:0,y1:2.05,f:d.f,id:`${d.id}#leaf`,owner:d.id,type:'door'});
   if(!d.exterior)for(const s of [-1,1])list.push({x0:d.x+s*.5-(s>0?.04:0),x1:d.x+s*.5+(s<0?.04:0),z0:d.z-INT_WALL/2,z1:d.z+INT_WALL/2,y0:0,y1:2.12,f:d.f,id:`${d.id}#jamb${s}`,owner:d.id,type:'frame'});}
  for(const o of objects){if(!o.solid||o.active===false)continue;o.localColliders.forEach((b,i)=>list.push({...localBoxToWorld(o,b),f:o.f,id:`${o.id}#${i}`,owner:o.id,type:'object'}));
   const T=o.localColliders;o.aabb=T.length?T.map(b=>localBoxToWorld(o,b)).reduce((a,b)=>({x0:Math.min(a.x0,b.x0),x1:Math.max(a.x1,b.x1),y0:Math.min(a.y0,b.y0),y1:Math.max(a.y1,b.y1),z0:Math.min(a.z0,b.z0),z1:Math.max(a.z1,b.z1)})):null;}
  for(const o of objects)if(!o.solid)o.aabb={x0:o.x-o.w/2,x1:o.x+o.w/2,z0:o.z-o.d/2,z1:o.z+o.d/2,y0:o.y??0,y1:(o.y??0)+o.h};
  const buckets=Array.from({length:FLOORS},()=>new Map());
  for(const c of list){c.nav=c.y0<NAV_BAND[1]&&c.y1>NAV_BAND[0];for(let bx=Math.floor(c.x0);bx<=Math.floor(c.x1);bx++)for(let bz=Math.floor(c.z0);bz<=Math.floor(c.z1);bz++){const k=bx*64+bz;const m=buckets[c.f];if(!m.has(k))m.set(k,[]);m.get(k).push(c);}}
  world.colliders=list;world.buckets=buckets;world.version++;world.edgeCache=new Map();world.navCache=new Map();world._sig=signature();world.walls=staticWallCells;
 }
 const dynamic=objects.filter(o=>o.solid||o.type==='door');
 const signature=()=>dynamic.map(o=>`${o.x},${o.z},${o.rot},${o.open},${o.active}`).join('|');
 world.sync=()=>{if(signature()!==world._sig)build();return world.version;};
 world.rebuild=build;build();

 let stamp=0;
 const bucket=(x,z,f)=>world.buckets[f]?.get(Math.floor(x)*64+Math.floor(z));
 world.collidersAt=(x,z,f)=>bucket(x,z,f)??[];
 world.blocked=(x,z,f)=>{if(x<EXT_WALL/2||x>W-EXT_WALL/2||z<EXT_WALL/2||z>D-EXT_WALL/2)return true;for(const c of bucket(x,z,f)??[])if(c.nav&&x>=c.x0&&x<=c.x1&&z>=c.z0&&z<=c.z1)return true;return false;};
 world.surfaceHeight=(x,z,f)=>{let h=0;for(const c of bucket(x,z,f)??[])if(x>=c.x0&&x<=c.x1&&z>=c.z0&&z<=c.z1)h=Math.max(h,c.y1);return h;};
 // Exact swept test: the segment against every obstacle box grown by the clearance margin
 // (thin parts such as door leaves cannot slip between samples).
 world.segmentClear=(a,b,margin=0)=>{if(a.f!==b.f)return false;const lo=EXT_WALL/2+margin,hx=W-EXT_WALL/2-margin,hz=D-EXT_WALL/2-margin;
  if(Math.min(a.x,b.x)<lo||Math.max(a.x,b.x)>hx||Math.min(a.z,b.z)<lo||Math.max(a.z,b.z)>hz)return false;
  stamp++;const dx=b.x-a.x,dz=b.z-a.z;
  for(let bx=Math.floor(Math.min(a.x,b.x)-margin);bx<=Math.floor(Math.max(a.x,b.x)+margin);bx++)for(let bz=Math.floor(Math.min(a.z,b.z)-margin);bz<=Math.floor(Math.max(a.z,b.z)+margin);bz++)for(const c of world.buckets[a.f].get(bx*64+bz)??[]){
   if(c._s===stamp||!c.nav)continue;c._s=stamp;let t0=0,t1=1;
   for(const [o,d,l,h]of [[a.x,dx,c.x0-margin,c.x1+margin],[a.z,dz,c.z0-margin,c.z1+margin]]){if(Math.abs(d)<1e-12){if(o<l||o>h){t0=2;break;}continue;}let p=(l-o)/d,q=(h-o)/d;if(p>q)[p,q]=[q,p];t0=Math.max(t0,p);t1=Math.min(t1,q);if(t0>t1)break;}
   if(t0<=t1)return false;}
  return true;};
 const navRaw=(x,z,f)=>world.blocked(x,z,f)||!world.segmentClear({x:x-.26,z,f},{x:x+.26,z,f})||!world.segmentClear({x,z:z-.26,f},{x,z:z+.26,f});
 world.navBlocked=(x,z,f)=>{if(x!==Math.round(x)||z!==Math.round(z))return navRaw(x,z,f);const k=(f*64+x)*64+z;let v=world.navCache.get(k);if(v===undefined){v=navRaw(x,z,f);world.navCache.set(k,v);}return v;};
 // Ground-truth traversability of a grid edge, cached until any door or object changes.
 world.edgeClear=(k1,k2)=>{const id=k1<k2?k1+'|'+k2:k2+'|'+k1;let v=world.edgeCache.get(id);if(v===undefined){const a=point(k1),b=point(k2);v=a.f!==b.f||world.segmentClear(a,b,.22);world.edgeCache.set(id,v);}return v;};

 // 3D ray cast through the bucket grid (slab test per box). Returns the nearest hit.
 world.raycast=(f,ox,oy,oz,dx,dy,dz,maxT,opts={})=>{
  stamp++;const ignore=opts.ignore,band=opts.band;let best=maxT,hit=null;
  if(dy<0){const t=-oy/dy;if(t<best){best=t;hit={t,floor:true};}}
  if(dy>0&&opts.ceiling!==false){const t=(CEILING-oy)/dy;if(t<best){best=t;hit={t,ceiling:true};}}
  let bx=Math.floor(ox),bz=Math.floor(oz);const sx=Math.sign(dx),sz=Math.sign(dz);
  const tdx=dx?Math.abs(1/dx):Infinity,tdz=dz?Math.abs(1/dz):Infinity;let tmx=dx?((sx>0?bx+1-ox:ox-bx)*tdx):Infinity,tmz=dz?((sz>0?bz+1-oz:oz-bz)*tdz):Infinity;let t=0;
  const m=world.buckets[f];
  for(let guard=0;guard<260&&t<=best;guard++){
   for(const c of m.get(bx*64+bz)??[]){if(c._s===stamp)continue;c._s=stamp;if(ignore&&ignore(c))continue;if(band&&!(c.y0<band[1]&&c.y1>band[0]))continue;
    let t0=0,t1=best;for(const [o,d,lo,hi]of [[ox,dx,c.x0,c.x1],[oy,dy,c.y0,c.y1],[oz,dz,c.z0,c.z1]]){if(Math.abs(d)<1e-12){if(o<lo||o>hi){t0=Infinity;break;}continue;}let a=(lo-o)/d,b=(hi-o)/d;if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)break;}
    if(t0<=t1&&t0<best){best=t0;hit={t:t0,collider:c};}}
   if(tmx<tmz){t=tmx;tmx+=tdx;bx+=sx;}else{t=tmz;tmz+=tdz;bz+=sz;}
   if(bx<-2||bz<-2||bx>W+2||bz>D+2)break;
  }
  return hit;
 };
 // Line of sight between an observer eye and a target point; colliders containing the
 // target (the surface being looked at) are ignored so their own faces can be seen.
 world.visible=(a,b,fromY=null,toY=null)=>{if(a.f!==b.f)return false;const y0=fromY??a.eye??EYE[a.type]??1,y1=toY??b.y??.5;
  const dx=b.x-a.x,dy=y1-y0,dz=b.z-a.z,len=Math.hypot(dx,dy,dz);if(len<1e-6)return true;
  const inside=c=>b.x>=c.x0-.03&&b.x<=c.x1+.03&&b.z>=c.z0-.03&&b.z<=c.z1+.03&&y1>=c.y0-.03&&y1<=c.y1+.03;
  const self=c=>(b.owner&&c.owner===b.owner)||inside(c)||(a.owner&&c.owner===a.owner);
  const hit=world.raycast(a.f,a.x,y0,a.z,dx/len,dy/len,dz/len,len-.02,{ignore:self,ceiling:false});return !hit||hit.floor&&hit.t>len-.06;};
 world.roomAt=p=>rooms.find(r=>r.f===p.f&&p.x>=r.minX-.4&&p.x<=r.maxX+.4&&p.z>=r.minZ-.4&&p.z<=r.maxZ+.4);
 world.roomContaining=p=>rooms.find(r=>r.f===p.f&&p.x>=r.bounds.x0&&p.x<=r.bounds.x1&&p.z>=r.bounds.z0&&p.z<=r.bounds.z1);
 world.setDoor=(id,open)=>{const d=byId.get(id);if(!d||d.exterior)return false;d.open=open;world.sync();return true;};
 world.addObject=o=>{objects.push(o);byId.set(o.id,o);o.aabb={x0:o.x-o.w/2,x1:o.x+o.w/2,z0:o.z-o.d/2,z1:o.z+o.d/2,y0:o.y??0,y1:(o.y??0)+o.h};return o;};
 world.servicePoint=o=>o.access?{x:o.access.x,z:o.access.z,f:o.f}:{x:Math.round(o.x),z:Math.round(o.z),f:o.f};

 // ---- reachable service cells: litter, spills, hubs and anchor furniture get an access cell
 // that is reachable from the room's own door (computed once from the true geometry) ----
 world.reachableCells=r=>{const starts=r.kind==='room'?doors.filter(d=>d.connects?.[0]===r.id&&!d.exterior).map(d=>d.access[0]):[{x:r.minX,z:r.minZ}];const inRoom=(x,z)=>x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ;
  const seen=new Set(),out=[],q=[];for(const s of starts){const k=key(s.x,s.z,r.f);if(!seen.has(k)&&inRoom(s.x,s.z)&&!world.navBlocked(s.x,s.z,r.f)){seen.add(k);q.push(k);}}
  while(q.length){const k=q.shift();out.push(point(k));const p=point(k);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,z=p.z+dz,n=key(x,z,r.f);if(seen.has(n)||!inRoom(x,z)||world.navBlocked(x,z,r.f)||!world.edgeClear(k,n))continue;seen.add(n);q.push(n);}}
  return out;};
 // A cell with generous clearance: what a robot's conservative 0.25 m map will also call free.
 world.clearCell=(x,z,f,r=.45)=>!world.navBlocked(x,z,f)&&world.segmentClear({x:x-r,z,f},{x:x+r,z,f})&&world.segmentClear({x,z:z-r,f},{x,z:z+r,f});
 for(const r of rooms){if(r.kind!=='room')continue;const all=world.reachableCells(r);r.reachable=all.length;if(!all.length)continue;const door=all[0],roomy=all.filter(c=>world.clearCell(c.x,c.z,r.f)),cells=roomy.length>=3?roomy:all;
  const near=(o)=>{const b=o.aabb??{x0:o.x,x1:o.x,z0:o.z,z1:o.z};let best=cells[0],bd=Infinity;for(const c of cells){const nx=Math.max(b.x0,Math.min(b.x1,c.x)),nz=Math.max(b.z0,Math.min(b.z1,c.z)),d=Math.hypot(nx-c.x,nz-c.z);if(d<bd){bd=d;best=c;}}return best;};
  for(const o of objects)if(o.room===r.id&&o.needsAccess&&!o.access){const c=near(o);o.access={x:c.x,z:c.z};}
  // Spread litter and spills over cells away from the door, deterministically.
  const far=[...cells].sort((a,b)=>Math.hypot(b.x-door.x,b.z-door.z)-Math.hypot(a.x-door.x,a.z-door.z)),used=new Set();let k=(r.f*5+r.idx*3)%Math.max(1,Math.min(6,far.length));
  for(const o of objects)if(o.room===r.id&&o.placeOnFloor){let c=far[k%far.length];for(let j=0;j<far.length&&used.has(key(c.x,c.z,0));j++)c=far[(k+j)%far.length];used.add(key(c.x,c.z,0));k+=2;o.x=c.x;o.z=c.z;o.access={x:c.x,z:c.z};}
 }
 build();
 return world;
}

// ------------------------------------------------------------------ grid routing ---
// links: false (no vertical travel), true (every link) or a Set of known link ids.
export function neighbors(k,links=false){const p=point(k),out=[];for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=p.x+x,nz=p.z+z;if(nx>=1&&nx<W&&nz>=1&&nz<D)out.push(key(nx,nz,p.f));}
 if(links){const l=LINK_AT.get(k);if(l&&(links===true||links.has(l.id)))for(const g of linkTargets(l,p.f))out.push(key(p.x,p.z,g));}return out;}
// A* with a binary heap. edgeBlocked(k1,k2) optionally rejects grid edges that cut a corner
// of an obstacle (e.g. a swung-open door leaf) even when both cells are free.
export function route(start,goal,blocked,links=false,edgeBlocked=null,cellCost=null){
 const s=key(start.x,start.z,start.f),g=typeof goal==='string'?goal:key(goal.x,goal.z,goal.f);if(s===g)return [];
 const gp=point(g),hs=cellCost?.64:1,h=k=>{const p=point(k);return hs*Math.hypot(p.x-gp.x,p.z-gp.z,(p.f-gp.f)*H);};
 const cost=new Map([[s,0]]),parent=new Map(),closed=new Set(),heap=[[h(s),s]];
 const push=e=>{heap.push(e);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
 while(heap.length){const [,c]=pop();if(closed.has(c))continue;if(c===g){const out=[];for(let k=g;k!==s;k=parent.get(k))out.unshift(point(k));return out;}closed.add(c);const cp=point(c);
  for(const n of neighbors(c,links)){if(closed.has(n)||blocked(n)||(edgeBlocked&&edgeBlocked(c,n)))continue;const np=point(n);const v=cost.get(c)+(cp.f===np.f?(cellCost?cellCost(n):1):linkCost(LINK_AT.get(c),cp.f,np.f));if(v<(cost.get(n)??Infinity)){cost.set(n,v);parent.set(n,c);push([v+h(n),n]);}}}
 return null;
}

// ------------------------------------------------------------------ link traversal ---
// The polyline for an upward traversal from lo to hi; y is measured from floor lo.
function upPath(l,lo,hi){return l.kind==='stair'?flightPath(l):liftPath(l,hi-lo);}
const lengthOf=P=>P.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-P[i][0],p[1]-P[i][1],p[2]-P[i][2]),0);
export function linkLength(l,from,to){return lengthOf(upPath(l,Math.min(from,to),Math.max(from,to)));}
// Position at fraction t of a traversal from floor `from` to floor `to` (y relative to the lower floor).
export function linkPosition(l,from,to,t){const lo=Math.min(from,to),hi=Math.max(from,to),P=upPath(l,lo,hi),segs=P.slice(1).map((p,i)=>Math.hypot(p[0]-P[i][0],p[1]-P[i][1],p[2]-P[i][2])),total=segs.reduce((a,b)=>a+b,0);
 let s=(from<to?t:1-t)*total;if(s>=total-1e-9){const e=P.at(-1);return {x:e[0],z:e[1],y:e[2],lo};}if(s<=1e-9){const e=P[0];return {x:e[0],z:e[1],y:e[2],lo};}for(let i=0;i<segs.length;i++){if(s<=segs[i]||i===segs.length-1){const a=P[i],b=P[i+1],u=segs[i]?Math.min(1,s/segs[i]):1;return {x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u,y:a[2]+(b[2]-a[2])*u,lo};}s-=segs[i];}}
export {flightPath,liftPath};
