// Physical house model: metric architecture, objects, colliders and spatial queries.
// The navigation grid stays at 1 m (cell keys "x,z,floor") for continuity with the original
// project; collision, visibility and sensing use continuous 3D axis-aligned boxes.
import {LAYOUT,WINDOWS,makeObject,localBoxToWorld,ROT} from './catalog.mjs?v=20261112b';

export const W=24,D=18,H=3.0;              // footprint 24 x 18 m, floor-to-floor 3.0 m
export const CEILING=2.7,EXT_WALL=.25,INT_WALL=.12,DOOR_CLEAR=1.0;
export const NAV_BAND=[.03,1.0];            // obstacle heights that intersect the robot body
export const EYE={robot:.95,human:1.55,cat:.3,dog:.45};
export const key=(x,z,f)=>`${Math.round(x)},${Math.round(z)},${f}`;
export const point=k=>{const [x,z,f]=k.split(',').map(Number);return {x,z,f};};
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.f-b.f)*H);
export const ROOM_TYPES=['workspace','meeting','pantry','print','reception','lounge','workspace','meeting','office','server','restroom','wellness'];
const ROOM_NAMES=[['Open workspace A','Boardroom','Pantry','Print & supply room','Reception','Lounge'],['Open workspace B','Huddle room','Manager\'s office','Server & IT room','Restrooms','Wellness room']];
const ZONE_NAMES={desks:'Window desks',bench:'Bench desks',lockers:'Lockers',meeting:'Meeting table',print:'Print station',supplies:'Supply storage',reception:'Reception desk',waiting:'Waiting area',lounge:'Lounge seating',booths:'Focus booths',exec:'Executive desk',meet:'Small meeting area',racks:'Server rack row',it:'IT workbench',seating:'Seating area',media:'Media wall',reading:'Reading corner',dining:'Dining area',counter:'Countertop area',cold:'Cold storage',island:'Prep island',waste:'Waste station',laundry:'Laundry area',cleaning:'Cleaning supplies',arrival:'Arrival area','pet-rest':'Pet resting area',feeding:'Feeding station',sleep:'Sleeping area',storage:'Storage area',study:'Study corner',play:'Play area',work:'Work area',library:'Library wall',grooming:'Grooming area',toilet:'Toilet area',bath:'Bathing area',cardio:'Cardio area',strength:'Strength area',charging:'Charging zone',recycling:'Recycling station'};

function wallBoxes(f){
 const e=EXT_WALL/2,i=INT_WALL/2,out=[];const add=(x0,x1,z0,z1,kind='interior')=>out.push({x0,x1,z0,z1,y0:0,y1:CEILING,f,kind});
 add(-e,W+e,-e,e,'exterior');add(-e,W+e,D-e,D+e,'exterior');add(-e,e,e,D-e,'exterior');
 add(W-e,W+e,e,8.5,'exterior');add(W-e,W+e,9.5,D-e,'exterior'); // stair-hall opening at z 8.5-9.5
 for(const z of [7,11]){let x=e;for(const c of [4,12,20]){add(x,c-DOOR_CLEAR/2,z-i,z+i);x=c+DOOR_CLEAR/2;}add(x,W-e,z-i,z+i);}
 for(const x of [8,16]){add(x-i,x+i,e,7-i);add(x-i,x+i,11+i,D-e);}
 return out;
}

export function createWorld(){
 const rooms=[],objects=[],zones=[],doors=[],windows=[];
 for(let f=0;f<2;f++){
  for(let i=0;i<6;i++){
   const col=i%3,back=i<3,x=col*8+4,z=back?4:14,id=`room-${f}-${i}`,c0=col*8;
   rooms.push({id,name:ROOM_NAMES[f][i],type:ROOM_TYPES[f*6+i]??ROOM_TYPES[i],kind:'room',f,x,z,minX:col*8+1,maxX:col*8+7,minZ:back?1:12,maxZ:back?6:17,
    bounds:{x0:c0+(col?INT_WALL/2:EXT_WALL/2),x1:c0+8-(col<2?INT_WALL/2:EXT_WALL/2),z0:back?EXT_WALL/2:11+INT_WALL/2,z1:back?7-INT_WALL/2:D-EXT_WALL/2},
    light:true,temp:21+i*.8+f,lastSample:null,door:`door-${f}-${i}`});
   const wallZ=back?7-INT_WALL/2:11+INT_WALL/2,inward=back?-1:1;
   // Service objects retain their original ids and access cells.
   objects.push({...makeObject(['hub',`hub-${id}`,`${ROOM_NAMES[f][i]} sensor hub`,x+1.6,wallZ+inward*.02,back?ROT.N:ROT.S,.12,.03,.12,{y:1.45,solid:false}],{f,room:id}),id:`hub-${id}`,access:{x:x+1,z:back?6:12}});
   objects.push({...makeObject(['switch',`switch`,`${ROOM_NAMES[f][i]} light switch`,x+.75,wallZ+inward*.01,back?ROT.N:ROT.S,.08,.015,.12,{y:1.15,solid:false}],{f,room:id})});
   objects.push({...makeObject(['outlet',`outlet-1`,`${ROOM_NAMES[f][i]} outlet`,x-2.4,wallZ+inward*.01,back?ROT.N:ROT.S,.08,.015,.08,{y:.3,solid:false}],{f,room:id})});
   objects.push({...makeObject(['trash',`trash-${f}-${i}`,`${ROOM_NAMES[f][i]} litter`,x+2,z+1,0,.3,.25,.12,{solid:false}],{f,room:id}),id:`trash-${f}-${i}`,active:true,access:{x:x+2,z:z+1}});
   if([1,2,4].includes(i))objects.push({...makeObject(['surface',`surface-${f}-${i}`,`${ROOM_NAMES[f][i]} floor spill`,x+2,z-1,0,.7,.55,.004,{solid:false}],{f,room:id}),id:`surface-${f}-${i}`,active:true,access:{x:x+2,z:z-1}});
   // Interior door: hinge on the west jamb, swings into the room.
   const doorZ=back?7:11;
   const door={...makeObject(['door',`door-${f}-${i}`,`${ROOM_NAMES[f][i]} door`,x,doorZ,back?ROT.N:ROT.S,.92,.04,2.05,{solid:false}],{f,room:id}),id:`door-${f}-${i}`,
    open:true,locked:false,exterior:false,hinge:{x:x-.46,z:doorZ},swing:inward,connects:[id,`corridor-${f}`],access:[{x,z:doorZ+inward},{x,z:doorZ-inward}]};
   door.parts=[{id:`${door.id}:leaf`,level:'object',kind:'door-leaf',name:'Door leaf',joint:'revolute',hinge:'west',axis:[0,1,0],limit:[0,Math.PI/2],children:[{id:`${door.id}:handle`,level:'part',kind:'handle',name:'Lever handle',grasp:{p:null,approach:null}},{id:`${door.id}:hinge`,level:'part',kind:'hinge',name:'Hinge set'}]}];
   doors.push(door);objects.push(door);
   for(const spec of LAYOUT[id]??[])objects.push(makeObject(spec,{f,room:id}));
  }
  rooms.push({id:`corridor-${f}`,name:f?'Level 2 corridor':'Level 1 corridor',type:'corridor',kind:'corridor',f,x:12,z:9,minX:1,maxX:23,minZ:8,maxZ:10,bounds:{x0:EXT_WALL/2,x1:W-EXT_WALL/2,z0:7+INT_WALL/2,z1:11-INT_WALL/2},light:true,temp:21+f,lastSample:null});
  for(const spec of LAYOUT[`corridor-${f}`]??[])objects.push(makeObject(spec,{f,room:`corridor-${f}`}));
 }
 const front={...makeObject(['door','door-0-front','Front door',12,D,ROT.S,.92,.05,2.1,{solid:false}],{f:0,room:'room-0-4'}),id:'door-0-front',name:'Main entrance',open:false,locked:true,exterior:true,hinge:{x:11.54,z:D},swing:-1,connects:['room-0-4','outside'],access:[{x:12,z:17}]};
 front.parts=[{id:'door-0-front:leaf',level:'object',kind:'door-leaf',name:'Door leaf',joint:'revolute',children:[{id:'door-0-front:handle',level:'part',kind:'handle',name:'Lever handle'},{id:'door-0-front:lock',level:'part',kind:'lock',name:'Deadbolt'}]}];
 doors.push(front);objects.push(front);
 objects.push(
  {...makeObject(['dock','dock','Charging dock',.29,9,ROT.E,.6,.33,.35,{zone:'charging'}],{f:0,room:'corridor-0'}),id:'dock',access:{x:1,z:9}},
  {...makeObject(['bin','bin','Recycling station',21,10.69,ROT.N,.7,.5,.9,{zone:'recycling'}],{f:0,room:'corridor-0'}),id:'bin',access:{x:21,z:10}},
  {...makeObject(['stairs','stairs0','Lower stair landing',23,9,0,.9,.9,.01,{solid:false}],{f:0,room:'corridor-0'}),id:'stairs0',access:{x:23,z:9}},
  {...makeObject(['stairs','stairs1','Upper stair landing',23,9,0,.9,.9,.01,{solid:false}],{f:1,room:'corridor-1'}),id:'stairs1',access:{x:23,z:9}});
 WINDOWS.forEach(([f,side,along,width,sill,head,room],k)=>{const x=side==='N'||side==='S'?along:side==='W'?0:W,z=side==='W'||side==='E'?along:side==='N'?0:D;
  const rot={N:ROT.S,S:ROT.N,W:ROT.E,E:ROT.W}[side];const o={...makeObject(['window',`window-${f}-${k}`,`${rooms.find(r=>r.id===room).name} window`,x,z,rot,width,.08,head-sill,{y:sill,solid:false}],{f,room}),id:`window-${f}-${k}`,side,sill,head,width};windows.push(o);objects.push(o);});
 for(const o of objects){if(!o.zone)continue;let z=zones.find(z=>z.id===o.zone);if(!z){const k=o.zone.split(':zone-')[1];z={id:o.zone,name:ZONE_NAMES[k]??k,room:o.room,f:o.f,members:[]};zones.push(z);}z.members.push(o.id);}

 const world={rooms,objects,zones,doors,windows,version:0,walls:new Set()};
 const staticWalls=[0,1].flatMap(wallBoxes).map((b,i)=>({...b,id:`wall-${b.f}-${i}`,owner:null,type:'wall'}));
 world.wallBoxes=staticWalls;
 const byId=new Map(objects.map(o=>[o.id,o]));world.byId=byId;
 world.object=id=>byId.get(id);

 // ---- colliders and a 1 m spatial hash (spatial partitioning for all queries) ----
 world.doorColliders=d=>{const t=.04,leaf=.92;if(!d.open){return d.exterior?[{x0:d.x-.5,x1:d.x+.5,z0:d.z-.06,z1:d.z+.06}]:[{x0:d.x-.46,x1:d.x+.46,z0:d.z-t/2,z1:d.z+t/2}];}
  const z0=d.swing<0?d.z-INT_WALL/2-leaf:d.z+INT_WALL/2,z1=d.swing<0?d.z-INT_WALL/2:d.z+INT_WALL/2+leaf;return [{x0:d.hinge.x,x1:d.hinge.x+t,z0,z1}];};
 function build(){
  const list=[...staticWalls];
  for(const d of doors){for(const c of world.doorColliders(d))list.push({...c,y0:0,y1:2.05,f:d.f,id:`${d.id}#leaf`,owner:d.id,type:'door'});
   if(!d.exterior)for(const s of [-1,1])list.push({x0:d.x+s*.5-(s>0?.04:0),x1:d.x+s*.5+(s<0?.04:0),z0:d.z-INT_WALL/2,z1:d.z+INT_WALL/2,y0:0,y1:2.12,f:d.f,id:`${d.id}#jamb${s}`,owner:d.id,type:'frame'});}
  for(const o of objects){if(!o.solid||o.active===false)continue;o.localColliders.forEach((b,i)=>list.push({...localBoxToWorld(o,b),f:o.f,id:`${o.id}#${i}`,owner:o.id,type:'object'}));
   const T=o.localColliders;o.aabb=T.length?T.map(b=>localBoxToWorld(o,b)).reduce((a,b)=>({x0:Math.min(a.x0,b.x0),x1:Math.max(a.x1,b.x1),y0:Math.min(a.y0,b.y0),y1:Math.max(a.y1,b.y1),z0:Math.min(a.z0,b.z0),z1:Math.max(a.z1,b.z1)})):null;}
  for(const o of objects)if(!o.solid)o.aabb={x0:o.x-o.w/2,x1:o.x+o.w/2,z0:o.z-o.d/2,z1:o.z+o.d/2,y0:o.y??0,y1:(o.y??0)+o.h};
  const buckets=[new Map(),new Map()];
  for(const c of list){c.nav=c.y0<NAV_BAND[1]&&c.y1>NAV_BAND[0];for(let bx=Math.floor(c.x0);bx<=Math.floor(c.x1);bx++)for(let bz=Math.floor(c.z0);bz<=Math.floor(c.z1);bz++){const k=bx*64+bz;const m=buckets[c.f];if(!m.has(k))m.set(k,[]);m.get(k).push(c);}}
  world.colliders=list;world.buckets=buckets;world.version++;world.edgeCache=new Map();world._sig=signature();
  world.walls=new Set();for(let f=0;f<2;f++)for(let x=0;x<=W;x++)for(let z=0;z<=D;z++)if(staticWalls.some(w=>w.f===f&&x>=w.x0-1e-9&&x<=w.x1+1e-9&&z>=w.z0-1e-9&&z<=w.z1+1e-9))world.walls.add(key(x,z,f));
 }
 const dynamic=objects.filter(o=>o.solid||o.type==='door');
 const signature=()=>dynamic.map(o=>`${o.x},${o.z},${o.rot},${o.open},${o.active}`).join('|');
 world.sync=()=>{if(signature()!==world._sig)build();return world.version;};
 world.rebuild=build;build();

 let stamp=0;
 const bucket=(x,z,f)=>world.buckets[f].get(Math.floor(x)*64+Math.floor(z));
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
 world.navBlocked=(x,z,f)=>world.blocked(x,z,f)||!world.segmentClear({x:x-.26,z,f},{x:x+.26,z,f})||!world.segmentClear({x,z:z-.26,f},{x,z:z+.26,f});
 // Ground-truth traversability of a grid edge, cached until any door or object changes.
 world.edgeClear=(k1,k2)=>{const id=k1<k2?k1+'|'+k2:k2+'|'+k1;let v=world.edgeCache.get(id);if(v===undefined){const a=point(k1),b=point(k2);v=a.f!==b.f||world.segmentClear(a,b,.22);world.edgeCache.set(id,v);}return v;};

 // 3D ray cast through the bucket grid (slab test per box). Returns the nearest hit.
 world.raycast=(f,ox,oy,oz,dx,dy,dz,maxT,opts={})=>{
  stamp++;const ignore=opts.ignore,band=opts.band;let best=maxT,hit=null;
  if(dy<0){const t=-oy/dy;if(t<best){best=t;hit={t,floor:true};}}
  if(dy>0&&opts.ceiling!==false){const t=(CEILING-oy)/dy;if(t<best){best=t;hit={t,ceiling:true};}}
  let bx=Math.floor(ox),bz=Math.floor(oz);const sx=Math.sign(dx),sz=Math.sign(dz),hx=Math.hypot(dx,dz)||1e-9;
  const tdx=dx?Math.abs(1/dx):Infinity,tdz=dz?Math.abs(1/dz):Infinity;let tmx=dx?((sx>0?bx+1-ox:ox-bx)*tdx):Infinity,tmz=dz?((sz>0?bz+1-oz:oz-bz)*tdz):Infinity;let t=0;
  for(let guard=0;guard<200&&t<=best;guard++){
   for(const c of world.buckets[f].get(bx*64+bz)??[]){if(c._s===stamp)continue;c._s=stamp;if(ignore&&ignore(c))continue;if(band&&!(c.y0<band[1]&&c.y1>band[0]))continue;
    let t0=0,t1=best;for(const [o,d,lo,hi]of [[ox,dx,c.x0,c.x1],[oy,dy,c.y0,c.y1],[oz,dz,c.z0,c.z1]]){if(Math.abs(d)<1e-12){if(o<lo||o>hi){t0=Infinity;break;}continue;}let a=(lo-o)/d,b=(hi-o)/d;if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)break;}
    if(t0<=t1&&t0<best){best=t0;hit={t:t0,collider:c};}}
   if(tmx<tmz){t=tmx;tmx+=tdx;bx+=sx;}else{t=tmz;tmz+=tdz;bz+=sz;}
   if(bx<-2||bz<-2||bx>W+5||bz>D+2)break;
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
 return world;
}

// ------------------------------------------------------------------ grid routing ---
export function neighbors(k,stairs=false){const p=point(k),out=[];for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=p.x+x,nz=p.z+z;if(nx>=1&&nx<W&&nz>=1&&nz<D)out.push(key(nx,nz,p.f));}if(stairs&&p.x===23&&p.z===9)out.push(key(23,9,1-p.f));return out;}
// A* with a binary heap. edgeBlocked(k1,k2) optionally rejects grid edges that cut a corner
// of an obstacle (e.g. a swung-open door leaf) even when both cells are free.
export function route(start,goal,blocked,stairs=false,edgeBlocked=null){
 const s=key(start.x,start.z,start.f),g=typeof goal==='string'?goal:key(goal.x,goal.z,goal.f);if(s===g)return [];
 const gp=point(g),h=k=>{const p=point(k);return Math.hypot(p.x-gp.x,p.z-gp.z,(p.f-gp.f)*H);};
 const cost=new Map([[s,0]]),parent=new Map(),closed=new Set(),heap=[[h(s),s]];
 const push=e=>{heap.push(e);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
 while(heap.length){const [,c]=pop();if(closed.has(c))continue;if(c===g){const out=[];for(let k=g;k!==s;k=parent.get(k))out.unshift(point(k));return out;}closed.add(c);
  for(const n of neighbors(c,stairs)){if(closed.has(n)||blocked(n)||(edgeBlocked&&edgeBlocked(c,n)))continue;const v=cost.get(c)+(point(c).f===point(n).f?1:14);if(v<(cost.get(n)??Infinity)){cost.set(n,v);parent.set(n,c);push([v+h(n),n]);}}}
 return null;
}

// Enclosed U-shaped stair in the east stair hall (x 24-27, z 7.9-13.6): 2 flights x 9 risers
// of 0.167 m with a half landing. Agents follow this 3D polyline between the two landings.
export const STAIR_PATH=[[23,9,0],[24.5,9,0],[25.05,9.6,0],[25.05,12.4,H/2],[25.55,12.95,H/2],[26.05,12.4,H/2],[26.05,9.6,H],[25.3,9.0,H],[23,9,H]];
const SEG=STAIR_PATH.slice(1).map((p,i)=>Math.hypot(p[0]-STAIR_PATH[i][0],p[1]-STAIR_PATH[i][1],p[2]-STAIR_PATH[i][2]));
export const STAIR_LENGTH=SEG.reduce((a,b)=>a+b,0);
export function stairPosition(t,from){const v=from===0?t:1-t;let s=v*STAIR_LENGTH;for(let i=0;i<SEG.length;i++){if(s<=SEG[i]||i===SEG.length-1){const a=STAIR_PATH[i],b=STAIR_PATH[i+1],u=Math.min(1,s/SEG[i]);if(u>1-1e-9)return {x:b[0],z:b[1],y:b[2]};return {x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u,y:a[2]+(b[2]-a[2])*u};}s-=SEG[i];}}
