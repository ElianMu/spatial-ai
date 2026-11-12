// Environment genome: everything the environment designer may change between simulation runs.
// A genome is plain JSON (easy to store, diff, mutate, send to a Web Worker and share).
//
//   links        which stairs / lifts are in service (at least one stair always stays open)
//   closedDoors  room doors that are shut (MOMO has no arm, so a shut door is an obstacle)
//   zones        hindrances (penalty regions) and affordances (bonus regions) on the floor
//   dock, bin    where MOMO's charging dock and the recycling station are installed
//   staff        number of staff agents; seed drives every stochastic event
import {W,D,FLOORS,LINKS,PROGRAMME,PASSAGES,DOCK,RECYCLING} from './building.mjs?v=20261112v';

// Region kinds. speed multiplies walking / driving speed; energy multiplies the robot's
// battery drain (negative = charging); cost is what a planner pays per metre once it has seen
// the region; sensing scales the robot camera range; reveal = wayfinding signage.
export const ZONE_KINDS={
 'wet-floor':{type:'hindrance',label:'Wet floor',speed:.45,energy:2.2,color:'#3d9be0',why:'slippery: everyone slows down, the robot spends extra energy'},
 crowd:{type:'hindrance',label:'Crowded zone',speed:.55,energy:1.4,color:'#e0664f',why:'queues and furniture clutter: slow passage'},
 construction:{type:'hindrance',label:'Works area',speed:.35,energy:1.8,color:'#d98b2b',why:'temporary works: very slow, noisy'},
 glare:{type:'hindrance',label:'Sun glare',speed:.8,energy:1.0,sensing:.55,color:'#f2c94c',why:'low sun through glazing blinds the RGB-D camera (from real sun data)'},
 'fast-lane':{type:'affordance',label:'Fast lane',speed:1.55,energy:.7,color:'#2fb37f',why:'smooth, clear floor: faster and cheaper travel'},
 'charging-strip':{type:'affordance',label:'Charging strip',speed:1,energy:-2.5,color:'#7b61ff',why:'inductive charging while driving over it'},
 wayfinding:{type:'affordance',label:'Wayfinding sign',speed:1,energy:1,reveal:true,color:'#2d7fd2',why:'a building directory: reading it reveals every stair and lift on the floor'},
};
export const zoneCost=kind=>1/(ZONE_KINDS[kind]?.speed??1);

// Places where a region may be painted: corridors, cross passages and the L1 lobby.
const NC={z0:8.06,z1:11.94},SC={z0:18.06,z1:21.94};
export function zoneSites(f){const out=[];for(let x=2;x<=40;x+=2)for(const L of [4,6,8])if(x+L<=W-2){out.push({f,x0:x,x1:x+L,...NC});out.push({f,x0:x,x1:x+L,...SC});}
 for(const [a,b]of PASSAGES)out.push({f,x0:a+(a?.06:.13),x1:b-(b===W?.13:.06),z0:12.06,z1:17.94});return out;}

// Valid dock (north corridor, north wall) and recycling (south corridor, south wall) slots.
export function wallSlots(f,wall){const doors=wall==='N'?PROGRAMME[f].N.flatMap(r=>r.doors):PROGRAMME[f].S.flatMap(r=>r.doors);const z=wall==='N'?9:21;
 const landings=LINKS.filter(l=>f>=l.floors[0]&&f<=l.floors[1]).map(l=>l.landing);const out=[];
 for(let x=3;x<=W-3;x++)if(doors.every(d=>Math.abs(d-x)>=1.6)&&landings.every(p=>Math.hypot(p.x-x,p.z-z)>=2.5))out.push(x);return out;}

const Z=(id,kind,f,x0,x1,z0,z1)=>({id,kind,f,x0,x1,z0,z1});
export function defaultGenome(){return {name:'Baseline',seed:7,staff:10,
 links:Object.fromEntries(LINKS.map(l=>[l.id,true])),closedDoors:[],
 dock:{f:DOCK.f,x:DOCK.x},bin:{f:RECYCLING.f,x:RECYCLING.x},
 zones:[
  Z('z-wet-cafe','wet-floor',0,2,8,NC.z0,NC.z1),            // spills outside the café
  Z('z-crowd-lobby','crowd',0,18,30,SC.z0,SC.z1),            // lobby traffic
  Z('z-fast-l1','fast-lane',0,32,44,SC.z0,SC.z1),
  Z('z-charge-l1','charging-strip',0,30,36,NC.z0,NC.z1),
  ...Array.from({length:FLOORS},(_,f)=>Z(`z-sign-${f}`,'wayfinding',f,20.5,27.5,NC.z0,NC.z1)), // directory at every lift lobby
  Z('z-wet-l2','wet-floor',1,10,14,NC.z0,NC.z1),
  Z('z-works-l3','construction',2,34,40,SC.z0,SC.z1),
  Z('z-fast-l4','fast-lane',3,4,16,NC.z0,NC.z1),
 ]};}

// Small seeded PRNG (xorshift32) so mutations and stochastic events are reproducible.
export function prng(seed=1){let s=(seed>>>0)||1;const u=()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};return {u,int:n=>Math.floor(u()*n),pick:a=>a[Math.floor(u()*a.length)]};}
export const clone=g=>JSON.parse(JSON.stringify(g));

// One mutation = 1–3 random design moves. Returns {genome, changes:[text]}.
export function mutate(parent,seed){const r=prng(seed),g=clone(parent),changes=[];g.seed=(parent.seed*1103515245+seed*12345)%2147483647||1;
 const allDoors=PROGRAMME.flatMap((p,f)=>{let i=0;return ['N','C','S'].flatMap(b=>p[b].map(()=>`door-${f}-${i++}`));});
 const ops=[
  ()=>{const l=r.pick(LINKS);const stairsOpen=LINKS.filter(x=>x.kind==='stair'&&g.links[x.id]&&x.floors[1]===FLOORS-1).length;if(g.links[l.id]&&l.kind==='stair'&&l.floors[1]===FLOORS-1&&stairsOpen<=1)return;g.links[l.id]=!g.links[l.id];changes.push(`${l.name} ${g.links[l.id]?'reopened':'closed'}`);},
  ()=>{const kinds=Object.keys(ZONE_KINDS).filter(k=>k!=='glare');const k=r.pick(kinds),f=r.int(FLOORS),s=r.pick(zoneSites(f));g.zones.push({id:`z-${seed}-${g.zones.length}`,kind:k,...s});changes.push(`added ${ZONE_KINDS[k].label.toLowerCase()} on L${f+1} (x ${s.x0.toFixed(0)}–${s.x1.toFixed(0)})`);},
  ()=>{if(!g.zones.length)return;const i=r.int(g.zones.length),z=g.zones[i];g.zones.splice(i,1);changes.push(`removed ${ZONE_KINDS[z.kind].label.toLowerCase()} on L${z.f+1}`);},
  ()=>{if(!g.zones.length)return;const z=r.pick(g.zones),s=r.pick(zoneSites(z.f));Object.assign(z,{x0:s.x0,x1:s.x1,z0:s.z0,z1:s.z1});changes.push(`moved ${ZONE_KINDS[z.kind].label.toLowerCase()} on L${z.f+1}`);},
  ()=>{const d=r.pick(allDoors),i=g.closedDoors.indexOf(d);if(i>=0)g.closedDoors.splice(i,1);else if(g.closedDoors.length<8)g.closedDoors.push(d);changes.push(`${i>=0?'opened':'closed'} ${d}`);},
  ()=>{const f=0,x=r.pick(wallSlots(f,'N'));g.dock={f,x};changes.push(`dock moved to x ${x}`);},
  ()=>{const f=r.int(FLOORS),x=r.pick(wallSlots(f,'S'));g.bin={f,x};changes.push(`recycling moved to L${f+1} x ${x}`);},
  ()=>{const d=r.u()<.5?-2:2;g.staff=Math.max(4,Math.min(16,g.staff+d));changes.push(`staff ${d>0?'+':''}${d} → ${g.staff}`);},
 ];
 const n=1+r.int(3);let guard=0;while(changes.length<n&&guard++<20)r.pick(ops)();
 g.name=`${parent.name.split(' ›')[0]} › ${changes[0]??'variant'}`.slice(0,90);return {genome:g,changes};}

export function describeGenome(g){const closed=LINKS.filter(l=>!g.links[l.id]).map(l=>l.short);const counts={};for(const z of g.zones)counts[z.kind]=(counts[z.kind]??0)+1;
 return {links:closed.length?`closed: ${closed.join(', ')}`:'all stairs & lifts open',zones:Object.entries(counts).map(([k,n])=>`${n}× ${ZONE_KINDS[k].label}`).join(', ')||'no zones',doors:g.closedDoors.length?`${g.closedDoors.length} doors shut`:'all doors open',dock:`dock L${g.dock.f+1} x${g.dock.x}`,bin:`recycling L${g.bin.f+1} x${g.bin.x}`,staff:`${g.staff} staff`};}
void D;
