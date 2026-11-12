// Semantic spatial understanding: object detection model, the robot's belief, room
// segmentation/recognition and the hierarchical scene graph
//   House -> Floor -> Room -> Functional zone -> Furniture -> Object -> Part.
//
// Honest scope: detection is an *oracle-labelled detector with physical visibility*. An object is
// detected only when sample points on it are inside the camera frustum, within a size-dependent
// range and not occluded (3D ray casts against the physical model). The detector returns the
// true category and a persistent instance id (perfect data association); it does not run a
// learned vision model. Room labels, zones, support relations, adjacency and access are inferred
// from what has been observed, never read from the floor plan.
import {TYPES,toWorld,localBoxToWorld,worldDir} from './catalog.mjs?v=20261112t';
import {key,point,W,D,EYE,FLOORS,floorLabel} from './world.mjs?v=20261112t';

export const ROOM_LABELS={workspace:'Open workspace',meeting:'Meeting room',pantry:'Pantry',print:'Print room',reception:'Reception',lounge:'Lounge',office:'Private office',server:'Server room',restroom:'Restroom',wellness:'Wellness room',corridor:'Corridor'};
// Evidence that an observed object type contributes to each room type (rule-based recognition).
const EVIDENCE={workstation:{workspace:2.5,office:.6,server:.3},'office-chair':{workspace:.8,office:1,reception:.4},locker:{workspace:1.2},monitor:{workspace:.6,office:.6,reception:.3},keyboard:{workspace:.3,office:.3},laptop:{workspace:.3,meeting:.3,server:.3},
 'conference-table':{meeting:3,office:.8,print:.3},chair:{meeting:.8,office:.2},whiteboard:{meeting:1.2,workspace:.5},tv:{meeting:1,lounge:.8},'conference-phone':{meeting:1.5},sideboard:{meeting:.8},
 'base-cabinets':{pantry:3},refrigerator:{pantry:3},sink:{pantry:2},dishwasher:{pantry:2},island:{pantry:1.5},microwave:{pantry:1},'coffee-maker':{pantry:1},'water-cooler':{pantry:1},'vending-machine':{pantry:1.5},stool:{pantry:.5},'trash-bin':{pantry:.4,print:.3},'pantry-cabinet':{pantry:1},kettle:{pantry:.5},
 printer:{print:3.5},shredder:{print:2.5},'shelf-unit':{print:1,server:.6},'paper-ream':{print:1},vacuum:{print:.4},'mop-bucket':{print:.4},
 'reception-desk':{reception:4},'coat-rack':{reception:1.5},'umbrella-stand':{reception:1.5},
 sofa:{lounge:2.5,reception:1},armchair:{lounge:1.2,office:.3},'coffee-table':{lounge:1.5,reception:.8},'phone-booth':{lounge:2},
 desk:{office:2.5},bookshelf:{office:1.5,lounge:.3},'tall-cabinet':{office:.4,print:.4},
 'server-rack':{server:4},ups:{server:2.5},
 toilet:{restroom:4},vanity:{restroom:3},'hand-dryer':{restroom:2},toiletries:{restroom:1},
 treadmill:{wellness:4},'exercise-bike':{wellness:3},'weight-bench':{wellness:3},'dumbbell-rack':{wellness:2},dumbbells:{wellness:1},
 dock:{corridor:1},bin:{corridor:1},stairs:{corridor:2},elevator:{corridor:2},'dining-table':{pantry:1.5}};
const STRUCTURAL=new Set(['door','window','hub','switch','outlet','stairs','elevator']);
const isFurniture=o=>!TYPES[o.type]?.small&&!STRUCTURAL.has(o.type)&&o.type!=='rug'||o.type==='dock';

export function detectionRange(o){if(['door','window'].includes(o.type))return 7;const m=Math.max(o.size.w,o.size.d,o.size.h);return Math.min(6.5,1.4+m*9);}
function samplePoints(o){const b=o.aabb,y0=o.y??0,y1=y0+o.h;if(['hub','switch','outlet','window','mirror'].includes(o.type))return [{x:o.x,y:(y0+y1)/2,z:o.z}];
 if(o.type==='door'){return [{x:o.x,y:1,z:o.z},{x:o.x,y:1.9,z:o.z}];}
 const sx=Math.max(0,(b.x1-b.x0)/2-.04),sz=Math.max(0,(b.z1-b.z0)/2-.04),cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
 const top=Math.min(y1,2.6)-.01;return [{x:cx,y:(y0+top)/2,z:cz},{x:cx,y:top,z:cz},{x:cx-sx,y:top,z:cz-sz},{x:cx+sx,y:top,z:cz-sz},{x:cx-sx,y:top,z:cz+sz},{x:cx+sx,y:top,z:cz+sz}];}

// Run the simulated detector from the robot's true camera pose.
export function detectObjects(world,robot,fov){const eye={x:robot.x,z:robot.z,f:robot.f,eye:EYE.robot},out=[],expected=[];
 for(const o of world.objects){if(o.f!==robot.f||!o.aabb)continue;const range=detectionRange(o);
  const nx=Math.max(o.aabb.x0,Math.min(o.aabb.x1,robot.x)),nz=Math.max(o.aabb.z0,Math.min(o.aabb.z1,robot.z)),dist=Math.hypot(nx-robot.x,nz-robot.z);if(dist>range)continue;
  let seen=0,inView=0;const pts=samplePoints(o);
  for(const p of pts){const ang=Math.atan2(p.z-robot.z,p.x-robot.x),d=Math.atan2(Math.sin(ang-robot.heading),Math.cos(ang-robot.heading));if(Math.abs(d)>fov/2&&dist>.5)continue;inView++;if(world.visible(eye,{...p,f:o.f,owner:o.id}))seen++;}
  if(!inView)continue;if(o.active===false){expected.push({o,dist});continue;}
  if(seen)out.push({o,dist,fraction:seen/pts.length});else out.push({o,dist,fraction:0,occluded:true});}
 return {detections:out,absent:expected};}

export class SemanticBelief{
 constructor(){this.covis=new Set();this.objects=new Map();this.regionOf=new Map();this.regions=new Map();this.nextRegion=1;this.relations=[];this.version=0;this.lastGraph=-1;this.log=[];}
 // Fuse one perception cycle. delta maps world positions into the robot's map frame.
 integrate(world,robot,result,time,delta){
  const seenNow=new Set();
  for(const det of result.detections){const o=det.o;let b=this.objects.get(o.id);
   if(det.occluded){if(b&&b.visibility!=='visible')b.visibility='occluded';continue;}
   const p=delta(o.x,o.z),bb=o.aabb,box={x0:bb.x0+p.dx,x1:bb.x1+p.dx,z0:bb.z0+p.dz,z1:bb.z1+p.dz,y0:bb.y0,y1:bb.y1};
   const pd=Math.max(.15,Math.min(.85,.25+.65*det.fraction*(1-det.dist/detectionRange(o))));
   if(!b){b={id:o.id,f:o.f,type:o.type,category:o.category,label:o.name,firstSeen:time,count:0,conf:0,mobility:o.mobility,static:o.static,interactive:o.interactive,affordances:o.affordances,size:o.size,partsUnlocked:false};this.objects.set(o.id,b);this.version++;}
   const moved=b.pose&&Math.hypot(b.pose.x-p.x,b.pose.z-p.z)>.2;if(moved){this.log.push({time,id:o.id,msg:`${o.name} moved ${Math.hypot(b.pose.x-p.x,b.pose.z-p.z).toFixed(2)} m`});this.version++;}
   if(o.type==='door'&&b.state&&b.state!==(o.open?'open':'closed')){this.log.push({time,id:o.id,msg:`${o.name} is now ${o.open?'open':'closed'}`,door:true});this.version++;}
   Object.assign(b,{pose:{x:p.x,z:p.z,y:o.y??0,rot:o.rot},bbox:box,lastSeen:time,count:b.count+1,conf:1-(1-b.conf)*(1-pd),visibility:'visible',present:true,lastDist:det.dist,state:o.type==='door'?(o.open?'open':'closed'):o.active===false?'removed':undefined,exterior:o.exterior,locked:o.locked});
   if(det.dist<2.6&&b.conf>.55&&o.parts?.length&&!b.partsUnlocked){b.partsUnlocked=true;this.version++;}
   if(b.partsUnlocked)b.parts=o.parts;seenNow.add(o.id);}
  // Negative evidence: remembered objects that should be visible but are not there.
  for(const {o}of result.absent){const b=this.objects.get(o.id);if(!b||b.present===false)continue;b.conf*=.55;b.visibility='expected-missing';if(b.conf<.15){b.present=false;b.state='removed';this.log.push({time,id:o.id,msg:`${o.name} no longer observed (removed)`});this.version++;}}
  for(const b of this.objects.values())if(!seenNow.has(b.id)&&b.visibility==='visible')b.visibility='remembered';
 }
 // Floor seen from one viewpoint without looking through a doorway belongs to the same room,
 // even when furniture splits the free space (walls block the camera; desks and chairs do not).
 recordCovisibility(robot,floorPts){const f=robot.f,doors=[...this.doorCells(f).keys()].map(point),rk=key(robot.x,robot.z,f),rc=this.regionOf.get(rk);if(!rc||doors.some(d=>Math.abs(d.x-robot.x)<.8&&Math.abs(d.z-robot.z)<.8))return;
  for(const p of floorPts){const k=key(p.x,p.z,f),c=this.regionOf.get(k);if(!c||c===rc)continue;if(doors.some(d=>segBox(robot,p,{x0:d.x-.6,x1:d.x+.6,z0:d.z-.6,z1:d.z+.6})))continue;this.covis.add(rk<k?rk+'|'+k:k+'|'+rk);if(this.covis.size>4000)this.covis.delete(this.covis.values().next().value);}}
 // Door cells known to the robot become separators for room segmentation.
 doorCells(f){const out=new Map();for(const b of this.objects.values())if(b.type==='door'&&b.pose&&!b.exterior&&b.f===f&&b.present!==false)out.set(key(b.pose.x,b.pose.z,f),b);return out;}
 floorOf(b){return b.f;}
 // Segment the robot's 1 m navigation memory into rooms and classify each from evidence.
 segment(robot){
  const assign=new Map(),regions=[];
  for(let f=0;f<FLOORS;f++){const doors=this.doorCells(f),seen=new Set();
   for(const [k,v]of robot.memory){const p=point(k);if(p.f!==f||v.blocked||seen.has(k)||doors.has(k))continue;const cells=[],q=[k];seen.add(k);
    while(q.length){const c=q.pop();cells.push(c);const cp=point(c);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const n=key(cp.x+dx,cp.z+dz,f);if(seen.has(n)||doors.has(n))continue;const m=robot.memory.get(n);if(!m||m.blocked)continue;seen.add(n);q.push(n);}}
    if(cells.length)regions.push({f,cells});}}
  // Union raw components that were co-visible (same room split by furniture).
  {const comp=new Map();regions.forEach((r,i)=>{for(const c of r.cells)comp.set(c,i);});const parent=regions.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
   for(const pair of this.covis){const [a,b]=pair.split('|'),ia=comp.get(a),ib=comp.get(b);if(ia!==undefined&&ib!==undefined)parent[find(ia)]=find(ib);}
   const merged=new Map();regions.forEach((r,i)=>{const root=find(i);if(!merged.has(root))merged.set(root,{f:r.f,cells:[]});merged.get(root).cells.push(...r.cells);});
   regions.length=0;for(const r of merged.values())if(r.cells.length>=3)regions.push(r);}
  regions.sort((a,b)=>b.cells.length-a.cells.length);const claimed=new Set();
  for(const r of regions){const votes=new Map();for(const c of r.cells){const id=this.regionOf.get(c);if(id)votes.set(id,(votes.get(id)??0)+1);}
   let id=[...votes.entries()].sort((a,b)=>b[1]-a[1]).find(([v])=>!claimed.has(v))?.[0];if(!id)id=`region-${this.nextRegion++}`;claimed.add(id);r.id=id;for(const c of r.cells)assign.set(c,id);}
  this.regionOf=assign;const next=new Map();
  for(const r of regions){const ps=r.cells.map(point),xs=ps.map(p=>p.x),zs=ps.map(p=>p.z);const bb={x0:Math.min(...xs)-.5,x1:Math.max(...xs)+.5,z0:Math.min(...zs)-.5,z1:Math.max(...zs)+.5};
   next.set(r.id,{id:r.id,f:r.f,cells:r.cells,bbox:bb,area:r.cells.length,doors:[],objects:[],scores:{},label:'unknown',name:'Unclassified space',confidence:0,previous:this.regions.get(r.id)});}
  this.regions=next;
  // Attach observed objects and doors to their nearest region cell on the same floor.
  for(const b of this.objects.values()){if(!b.pose||b.present===false)continue;const f=this.floorOf(b);const sees=b.type==='door'?null:c=>!wallBetween(robot.map,f,b,c);b.region=this.nearestRegion(b.pose.x,b.pose.z,f,b.type==='door'?1.2:1.7,sees)??(b.type==='door'?null:this.nearestRegion(b.pose.x,b.pose.z,f,2.9,sees));if(b.type==='door'){const k=key(b.pose.x,b.pose.z,f);b.connects=[];for(const [dx,dz]of [[0,1],[0,-1],[1,0],[-1,0]]){const id=assign.get(key(b.pose.x+dx,b.pose.z+dz,f));if(id&&!b.connects.includes(id))b.connects.push(id);}for(const id of b.connects)this.regions.get(id)?.doors.push(b.id);void k;}
   else if(b.region)this.regions.get(b.region)?.objects.push(b.id);}
  for(const r of this.regions.values())this.classify(r);
  // Small fragments next to a larger region with the same evidence are folded into it.
  for(const r of [...this.regions.values()].sort((a,b)=>a.area-b.area)){if(r.area>=8)continue;const host=[...this.regions.values()].filter(h=>h!==r&&h.f===r.f&&h.area>r.area&&gap(h.bbox,r.bbox)<=1.2&&(h.label===r.label||r.label==='unknown')&&!r.doors.some(d=>h.doors.includes(d))).sort((a,b)=>b.area-a.area)[0];
   if(!host)continue;host.cells.push(...r.cells);host.objects.push(...r.objects);host.area=host.cells.length;host.bbox=union(host.bbox,r.bbox);for(const c of r.cells)this.regionOf.set(c,host.id);for(const id of r.objects)this.objects.get(id).region=host.id;this.regions.delete(r.id);this.classify(host);}
 }
 nearestRegion(x,z,f,reach,ok=null){let best=null,bd=reach;const R=Math.ceil(reach);for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){const k=key(x+dx,z+dz,f),id=this.regionOf.get(k);if(!id)continue;const p=point(k),d=Math.hypot(p.x-x,p.z-z);if(d<bd&&(!ok||ok(p))){bd=d;best=id;}}return best;}
 classify(r){const s={};for(const id of r.objects){const b=this.objects.get(id);for(const [t,w]of Object.entries(EVIDENCE[b.type]??{}))s[t]=(s[t]??0)+w*Math.min(1,b.conf+.2);}
  const w=r.bbox.x1-r.bbox.x0,d=r.bbox.z1-r.bbox.z0,long=Math.max(w,d),short=Math.min(w,d);const roomEvidence=Object.entries(s).filter(([k])=>k!=='corridor').reduce((a,[,v])=>a+v,0),narrow=narrowShare(r)>=.7,network=narrow&&r.area>=60;
  // Corridors: long and thin, or a large network of narrow passages (a racetrack plan).
  if(long/short>=3&&short<=4.2||narrow&&(r.area>=40||r.doors.length>=3)&&(roomEvidence<4||network))s.corridor=(s.corridor??0)+3+Math.min(3,r.doors.length*.6)+(network?Math.min(12,r.area*.03):0);
  r.scores=s;const ranked=Object.entries(s).sort((a,b)=>b[1]-a[1]);if(!ranked.length||ranked[0][1]<1.2)return;/* too little evidence: stay unclassified */const total=ranked.reduce((a,[,v])=>a+v,0);
  r.label=ranked[0][0];r.confidence=+(ranked[0][1]/(total+1)).toFixed(2);r.name=ROOM_LABELS[r.label];
  if(r.label==='meeting'){const seats=r.objects.filter(id=>this.objects.get(id).type==='chair').length;r.name=seats>=6?'Boardroom':'Meeting room';}}
 // Functional zones grow around observed anchor furniture (sofa -> seating area, range -> cooking zone...).
 zones(){const zones=new Map();for(const b of this.objects.values()){if(!b.pose||b.present===false||!b.region)continue;const label=TYPES[b.type]?.zone;if(!label)continue;
   const id=`zone:${b.id}`;zones.set(id,{id,name:label,anchor:b.id,region:b.region,bbox:{x0:b.bbox.x0-1.1,x1:b.bbox.x1+1.1,z0:b.bbox.z0-1.1,z1:b.bbox.z1+1.1},members:[b.id]});}
  // Merge overlapping zones with the same label in one region (e.g. two bookshelves).
  for(const a of [...zones.values()])for(const c of [...zones.values()])if(a!==c&&zones.has(a.id)&&zones.has(c.id)&&a.name===c.name&&a.region===c.region&&overlap(a.bbox,c.bbox)){a.members.push(...c.members);a.bbox=union(a.bbox,c.bbox);zones.delete(c.id);}
  for(const b of this.objects.values()){if(!b.pose||b.present===false||!b.region||TYPES[b.type]?.zone)continue;if(['door','window','hub','switch','outlet'].includes(b.type))continue;let best=null,bd=Infinity;for(const z of zones.values()){if(z.region!==b.region||!inside2(b.pose,z.bbox))continue;const a=this.objects.get(z.anchor),d=Math.hypot(a.pose.x-b.pose.x,a.pose.z-b.pose.z);if(d<bd){bd=d;best=z;}}if(best){best.members.push(b.id);b.zone=best.id;}else b.zone=null;}
  for(const z of zones.values())for(const id of z.members)this.objects.get(id).zone=z.id;
  return zones;}
 // Build the full belief scene graph (throttled by the caller).
 graph(robot,time){this.segment(robot);const zones=this.zones(),nodes=[],edges=[],node=(n)=>{nodes.push(n);return n;},rel=(type,from,to,extra)=>edges.push({type,from,to,...extra});
  node({id:'house',level:'house',label:'Building (robot belief)'});
  for(let f=0;f<FLOORS;f++)if([...this.regions.values()].some(r=>r.f===f))node({id:`floor-${f}`,level:'floor',label:`Level ${f+1}`,parent:'house'});
  for(const r of this.regions.values()){node({id:r.id,level:'room',label:r.name,parent:`floor-${r.f}`,attrs:{label:r.label,confidence:r.confidence,area_m2:r.area,doors:r.doors.length,evidence:Object.fromEntries(Object.entries(r.scores).map(([k,v])=>[k,+v.toFixed(2)]))}});}
  for(const z of zones.values())node({id:z.id,level:'zone',label:z.name,parent:z.region,attrs:{anchor:z.anchor,members:z.members.length}});
  const support=new Map();
  for(const b of this.objects.values()){if(!b.pose||b.present===false)continue;
   const f=b.f,small=TYPES[b.type]?.small&&!['hub','switch','outlet','trash','surface'].includes(b.type);
   let parent=b.zone??b.region??`floor-${f}`;
   if(small){for(const c of this.objects.values()){if(c===b||!c.bbox||c.present===false||TYPES[c.type]?.small||c.type==='rug')continue;if(Math.abs(b.bbox.y0-c.bbox.y1)<.06&&inside2(b.pose,c.bbox)){support.set(b.id,c.id);parent=c.id;break;}}}
   node({id:b.id,level:isFurniture(b)?'furniture':['door','window'].includes(b.type)?'furniture':'object',label:b.label,parent,attrs:attrs(b,time)});
   if(b.partsUnlocked&&b.parts)for(const p of b.parts){node({id:p.id,level:p.level,label:p.name,parent:b.id,attrs:partAttrs(b,p,robot)});for(const c of p.children??[])node({id:c.id,level:c.level,label:c.name,parent:p.id,attrs:partAttrs(b,c,robot)});}}
  const ids=new Set(nodes.map(n=>n.id));for(const n of nodes)if(n.parent&&!ids.has(n.parent))n.parent=n.parent.startsWith('zone:')?this.objects.get(n.id)?.region??'house':'house';
  // Relations.
  const levelOf=new Map(nodes.map(n=>[n.id,n.level]));
  for(const n of nodes){if(!n.parent)continue;const pl=levelOf.get(n.parent);if(['house','floor','room','zone'].includes(pl)){rel('inside',n.id,n.parent);rel('contains',n.parent,n.id);}else if(n.level==='part'||n.attrs?.kind){rel('part_of',n.id,n.parent);}}
  for(const [a,c]of support)rel('on_top_of',a,c);
  const objs=[...this.objects.values()].filter(b=>b.pose&&b.present!==false&&isFurniture(b)&&b.region);
  for(let i=0;i<objs.length;i++)for(let j=i+1;j<objs.length;j++){const a=objs[i],c=objs[j];if(a.region!==c.region)continue;const g=gap(a.bbox,c.bbox);if(g<.45){rel('next_to',a.id,c.id,{gap_m:+g.toFixed(2)});rel('next_to',c.id,a.id,{gap_m:+g.toFixed(2)});}}
  for(const b of this.objects.values())if(b.type==='door'&&b.connects?.length){for(const r of b.connects)rel('connected_to',b.id,r);if(b.connects.length===2){const [a,c]=b.connects;rel('connected_to',a,c,{via:b.id});rel('connected_to',c,a,{via:b.id});if(b.state==='open'){rel('accessible_from',a,c,{via:b.id});rel('accessible_from',c,a,{via:b.id});}else{rel('obstructed_by',a,b.id,{reason:'door closed'});rel('obstructed_by',c,b.id,{reason:'door closed'});}}}
  for(const b of objs){const cell=accessCell(robot,b);if(cell){b.access=cell;rel('accessible_from',b.id,b.region,{cell:`${cell.x},${cell.z}`});}else b.access=null;}
  // Behind: as seen from the region's entrance door.
  for(const r of this.regions.values()){const door=r.doors.map(id=>this.objects.get(id))[0];if(!door)continue;const inR=objs.filter(b=>b.region===r.id);
   for(const a of inR)for(const c of inR){if(a===c)continue;const da=Math.hypot(a.pose.x-door.pose.x,a.pose.z-door.pose.z),dc=Math.hypot(c.pose.x-door.pose.x,c.pose.z-door.pose.z);if(da<dc&&segmentHitsBox(door.pose,c.pose,a.bbox,.05)&&a.bbox.y1>.4)rel('behind',c.id,a.id,{viewpoint:door.id});}}
  // Obstructed: something stands in front of an interactive face or inside a door swing.
  for(const a of objs){if(!a.interactive&&a.type!=='door')continue;const strip=frontStrip(a);if(!strip)continue;for(const c of objs){if(c===a||c.type==='rug'||c.type==='door')continue;if(overlap(strip,c.bbox)&&!(a.type==='dining-table'||c.type==='chair'&&a.type==='desk'||c.type==='office-chair'||c.type==='stool'&&a.type==='island'))rel('obstructed_by',a.id,c.id,{reason:'blocks the interaction face'});}}
  this.relations=edges;this.nodes=nodes;this.zoneMap=zones;this.lastGraph=time;return {nodes,edges};}
 // Multi-resolution summary of what the robot has, Level 1 (global) to Level 4 (task detail).
 levels(map){const regions=[...this.regions.values()],objs=[...this.objects.values()].filter(b=>b.present!==false),parts=objs.filter(b=>b.partsUnlocked);let grasps=0,reach=0;for(const b of parts)for(const p of b.parts??[])for(const c of [p,...(p.children??[])])if(c.grasp){grasps++;if(c._reachable)reach++;}
  const s=Array.from({length:FLOORS},(_,f)=>map.stats(f)),sum=k=>s.reduce((a,x)=>a+x[k],0);
  return {L1:{floors:new Set(regions.map(r=>r.f)).size,rooms:regions.length,recognised:regions.filter(r=>r.label!=='unknown').length,connections:this.relations.filter(e=>e.type==='connected_to'&&e.via).length/2},
   L2:{freeArea:+sum('areaFree').toFixed(1),occupiedCells:sum('occupied'),doors:objs.filter(b=>b.type==='door').length,windows:objs.filter(b=>b.type==='window').length},
   L3:{objects:objs.length,furniture:objs.filter(isFurniture).length,small:objs.filter(b=>TYPES[b.type]?.small).length},
   L4:{detailed:parts.length,parts:parts.reduce((a,b)=>a+(b.parts?.reduce((x,p)=>x+1+(p.children?.length??0),0)??0),0),grasps,reachable:reach}};}
}

function attrs(b,time){return {category:b.category,type:b.type,position:[+b.pose.x.toFixed(2),+(b.pose.y??0).toFixed(2),+b.pose.z.toFixed(2)],orientation_deg:Math.round((b.pose.rot??0)*180/Math.PI),bbox_m:[+(b.bbox.x1-b.bbox.x0).toFixed(2),+(b.bbox.y1-b.bbox.y0).toFixed(2),+(b.bbox.z1-b.bbox.z0).toFixed(2)],
 collision:b.bbox&&b.type!=='rug'&&!TYPES[b.type]?.small?'box':'none (non-obstacle)',mobility:b.mobility,static:b.static,interactive:b.interactive,affordances:b.affordances,confidence:+b.conf.toFixed(2),observations:b.count,first_seen_s:+b.firstSeen.toFixed(1),last_seen_s:+b.lastSeen.toFixed(1),age_s:+(time-b.lastSeen).toFixed(1),visibility:b.visibility,state:b.state,lod:b.partsUnlocked?4:3};}
function partAttrs(b,p,robot){const o={kind:p.kind,joint:p.joint,hinge:p.hinge};if(p.grasp?.p&&b.pose){const g=toWorld({x:b.pose.x,z:b.pose.z,y:b.pose.y,rot:b.pose.rot},...p.grasp.p),dir=worldDir({rot:b.pose.rot},p.grasp.approach);o.grasp_point=[+g.x.toFixed(2),+g.y.toFixed(2),+g.z.toFixed(2)];o.approach=dir.map(v=>+v.toFixed(2));
  // Reachable if a known free navigation cell lies within 0.9 m (arm reach) at a usable height.
  let r=false;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const m=robot.memory.get(key(g.x+dx,g.z+dz,b.f));const c={x:Math.round(g.x+dx),z:Math.round(g.z+dz)};if(m&&!m.blocked&&Math.hypot(c.x-g.x,c.z-g.z)<=.95&&g.y>.05&&g.y<1.7)r=true;}o.reachable=r;p._reachable=r;}return o;}
function accessCell(robot,b){let best=null,bd=Infinity;for(let x=Math.floor(b.bbox.x0)-1;x<=Math.ceil(b.bbox.x1)+1;x++)for(let z=Math.floor(b.bbox.z0)-1;z<=Math.ceil(b.bbox.z1)+1;z++){const m=robot.memory.get(key(x,z,b.f));if(!m||m.blocked)continue;const nx=Math.max(b.bbox.x0,Math.min(b.bbox.x1,x)),nz=Math.max(b.bbox.z0,Math.min(b.bbox.z1,z)),d=Math.hypot(nx-x,nz-z);if(d<.95&&d<bd){bd=d;best={x,z,f:b.f};}}return best;}
// True when the robot's own map shows an obstacle run (a wall) between an object's footprint
// and a navigation cell: objects seen through a doorway must not be attached to the corridor.
function wallBetween(map,f,b,c){if(!map||!b.bbox)return false;const bb=b.bbox,cx=Math.max(bb.x0,Math.min(bb.x1,c.x)),cz=Math.max(bb.z0,Math.min(bb.z1,c.z)),L=Math.hypot(c.x-cx,c.z-cz),n=Math.ceil(L/.08);let run=0;
 for(let i=1;i<n;i++){const x=cx+(c.x-cx)*i/n,z=cz+(c.z-cz)*i/n;if(x>bb.x0-.03&&x<bb.x1+.03&&z>bb.z0-.03&&z<bb.z1+.03)continue;if(map.stateAt(x,z,f)===2){if(++run>=2)return true;}else run=0;}return false;}
// Share of a region's cells whose shorter straight free run (x or z) is at most 4 m: high for
// corridors and racetracks of corridors, low for rooms even when furniture interrupts them.
function narrowShare(r){const set=new Set(r.cells);let narrow=0;for(const c of r.cells){const p=point(c),run=(dx,dz)=>{let n=1;for(const s of [-1,1])for(let i=1;i<12;i++){if(!set.has(key(p.x+s*dx*i,p.z+s*dz*i,p.f)))break;n++;}return n;};if(Math.min(run(1,0),run(0,1))<=4)narrow++;}return narrow/Math.max(1,r.cells.length);}
const overlap=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.z0<b.z1&&b.z0<a.z1;
const union=(a,b)=>({x0:Math.min(a.x0,b.x0),x1:Math.max(a.x1,b.x1),z0:Math.min(a.z0,b.z0),z1:Math.max(a.z1,b.z1)});
const inside2=(p,b)=>p.x>=b.x0&&p.x<=b.x1&&p.z>=b.z0&&p.z<=b.z1;
const gap=(a,b)=>Math.hypot(Math.max(0,a.x0-b.x1,b.x0-a.x1),Math.max(0,a.z0-b.z1,b.z0-a.z1));
const segBox=(a,b,box)=>segmentHitsBox(a,b,box,0);
function segmentHitsBox(a,b,box,shrink=0){const x0=box.x0+shrink,x1=box.x1-shrink,z0=box.z0+shrink,z1=box.z1-shrink;let t0=0,t1=1;for(const [o,d,lo,hi]of [[a.x,b.x-a.x,x0,x1],[a.z,b.z-a.z,z0,z1]]){if(Math.abs(d)<1e-9){if(o<lo||o>hi)return false;continue;}let p=(lo-o)/d,q=(hi-o)/d;if(p>q)[p,q]=[q,p];t0=Math.max(t0,p);t1=Math.min(t1,q);if(t0>t1)return false;}return t1>0&&t0<1;}
function frontStrip(b){if(!b.pose||b.type==='door')return null;const dir=worldDir({rot:b.pose.rot},[0,0,1]),bb=b.bbox,depth=.55;
 if(dir[2]>.5)return {x0:bb.x0,x1:bb.x1,z0:bb.z1+.02,z1:bb.z1+depth};if(dir[2]<-.5)return {x0:bb.x0,x1:bb.x1,z0:bb.z0-depth,z1:bb.z0-.02};if(dir[0]>.5)return {x0:bb.x1+.02,x1:bb.x1+depth,z0:bb.z0,z1:bb.z1};return {x0:bb.x0-depth,x1:bb.x0-.02,z0:bb.z0,z1:bb.z1};}

// Ground-truth hierarchy for the observer (and for scoring the robot's belief).
export function groundTruthGraph(world){const nodes=[{id:'house',level:'house',label:'Building (ground truth)'}],edges=[];
 for(let f=0;f<FLOORS;f++)nodes.push({id:`floor-${f}`,level:'floor',label:`Level ${f+1}`,parent:'house'});
 for(const r of world.rooms)nodes.push({id:r.id,level:'room',label:r.name,parent:`floor-${r.f}`,attrs:{type:r.type,bounds:r.bounds}});
 for(const z of world.zones)nodes.push({id:z.id,level:'zone',label:z.name,parent:z.room,attrs:{members:z.members.length}});
 for(const o of world.objects){const parent=o.support??o.zone??o.room;nodes.push({id:o.id,level:o.support||TYPES[o.type]?.small&&!['hub','switch','outlet'].includes(o.type)?'object':'furniture',label:o.name,parent,attrs:{category:o.category,type:o.type,position:[+o.x.toFixed(2),+(o.y??0).toFixed(2),+o.z.toFixed(2)],bbox_m:[+o.w.toFixed(2),+o.h.toFixed(2),+o.d.toFixed(2)],mobility:o.mobility,interactive:o.interactive,affordances:o.affordances,state:o.type==='door'?(o.open?'open':'closed'):o.active===false?'removed':undefined}});
  for(const p of o.parts??[]){nodes.push({id:p.id,level:p.level,label:p.name,parent:o.id,attrs:{kind:p.kind,joint:p.joint}});for(const c of p.children??[])nodes.push({id:c.id,level:c.level,label:c.name,parent:p.id,attrs:{kind:c.kind}});}
  if(o.support)edges.push({type:'on_top_of',from:o.id,to:o.support});}
 for(const d of world.doors)for(const r of d.connects)edges.push({type:'connected_to',from:d.id,to:r});
 for(const n of nodes)if(n.parent){edges.push({type:'inside',from:n.id,to:n.parent});}
 return {nodes,edges};}
export {localBoxToWorld};
