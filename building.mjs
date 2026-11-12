// Hearth Tower: a five-storey, 48 x 30 m office building described as data plus procedural
// furnishing rules. Everything here is ground truth for the simulator and renderer; the robot
// never reads it (it only receives ray-cast sensor returns and detections).
//
// Plan (identical structural grid on every floor):
//
//   z  0 ┌──────────────── north perimeter rooms (programme varies per floor) ────────────────┐
//   z  8 ├──────────────────────────── north corridor (3 m) ─────────────────────────────────┤
//   z 12 │pass│ central room │ central room │pass│  LIFT CORE + copy hub │pass│ central │ central │pass│
//   z 18 ├──────────────────────────── south corridor (3 m) ─────────────────────────────────┤
//   z 22 │                     south perimeter rooms                                          │
//   z 30 └───────────────────────────────────────────────────────────────────────────────────┘
//
// Four open cross passages link the two corridors into a racetrack, so most destinations have
// more than one route. Vertical circulation: West stair (L1–L5), East stair (L1–L5), a feature
// stair that only serves L1–L3, and two lifts in the central core serving every floor.
import {ROT,toWorld} from './catalog.mjs?v=20261112t';

export const W=48,D=30,FLOORS=5,H=3.6,CEILING=3.0,EXT_WALL=.25,INT_WALL=.12,DOOR_CLEAR=1.0;
export const FLOOR_NAMES=['L1 · Lobby & amenities','L2 · Engineering','L3 · Design studio','L4 · Operations','L5 · Executive'];
export const BANDS={N:{z0:0,z1:8,doorZ:8,doorWall:'S',corridor:'n'},S:{z0:22,z1:30,doorZ:22,doorWall:'N',corridor:'s'}};
export const CORRIDORS=[{id:'n',name:'North corridor',z0:8,z1:12},{id:'s',name:'South corridor',z0:18,z1:22}];
export const CENTRAL={z0:12,z1:18};
export const PASSAGES=[[0,3],[15,19],[29,33],[45,48]];
export const CORE={x0:19,x1:29,z0:12-INT_WALL/2,z1:14.4};        // solid lift / riser core
export const CENTRAL_SPANS=[[3,15],[19,29],[33,45]];                 // where the z=12 / z=18 walls run

// Vertical links. A stair is a polyline per flight (one floor); a lift can jump several floors.
// landing = navigation cell on each served floor; side = which exterior wall the tower sits on.
export const LINKS=[
 {id:'stair-west',kind:'stair',name:'West stair',short:'Stair A',side:'W',landing:{x:1,z:10},floors:[0,4]},
 {id:'stair-east',kind:'stair',name:'East stair',short:'Stair B',side:'E',landing:{x:47,z:20},floors:[0,4]},
 {id:'stair-feature',kind:'stair',name:'Feature stair (L1–L3)',short:'Stair C',side:'W',landing:{x:1,z:20},floors:[0,2]},
 {id:'lift-1',kind:'lift',name:'Lift 1',short:'Lift 1',landing:{x:22,z:11},car:{x:22,z:13.2},floors:[0,4]},
 {id:'lift-2',kind:'lift',name:'Lift 2',short:'Lift 2',landing:{x:26,z:11},car:{x:26,z:13.2},floors:[0,4]},
];
for(const l of LINKS){if(l.kind==='stair'){l.xEdge=l.side==='W'?0:W;l.s=l.side==='W'?-1:1;l.zc=l.landing.z;}}
export const linkServes=(l,f)=>f>=l.floors[0]&&f<=l.floors[1];

// One flight of a U-shaped stair from floor-relative height 0 to H, in world x/z.
// Tower local frame: u = distance outward from the facade, v = offset along the facade.
export function stairLocal(l,u,v){return {x:l.xEdge+l.s*u,z:l.zc+v};}
export function flightPath(l){const L=l.landing,p=(u,v,y)=>{const q=stairLocal(l,u,v);return [q.x,q.z,y];};
 return [[L.x,L.z,0],p(.5,0,0),p(1.05,.6,0),p(1.05,3.4,H/2),p(1.55,3.95,H/2),p(2.05,3.4,H/2),p(2.05,.6,H),p(1.3,0,H),[L.x,L.z,H]];}
export function liftPath(l,floorsMoved){const y=floorsMoved*H,{x,z}=l.landing,c=l.car;return [[x,z,0],[c.x,c.z,0],[c.x,c.z,y],[x,z,y]];}

// ------------------------------------------------------------------ floor programmes ---
// [x0, x1, room type, name, door x positions, door wall for central rooms]
const P=(x0,x1,type,name,doors,wall)=>({x0,x1,type,name,doors,wall});
const centralCommon=(b,c)=>[P(3,9,'restroom','Restrooms (west)',[6],'N'),b,P(19,29,'print','Copy hub',[24],'S'),c,P(39,45,'restroom','Restrooms (east)',[42],'N')];
export const PROGRAMME=[
 {N:[P(0,12,'pantry','Staff café',[4,9]),P(12,20,'wellness','Fitness studio',[17]),P(20,28,'print','Mailroom',[24]),P(28,38,'meeting','Town hall',[31,35]),P(38,48,'lounge','Library lounge',[43])],
  C:centralCommon(P(9,15,'office','Security office',[12],'S'),P(33,39,'server','Main IT room',[36],'S')),
  S:[P(0,10,'meeting','Client meeting room',[5]),P(10,16,'office','Facilities office',[13]),P(16,32,'reception','Main lobby',[20,28]),P(32,40,'lounge','Visitor lounge',[36]),P(40,48,'workspace','Co-working',[44])]},
 {N:[P(0,16,'workspace','Engineering (west)',[5,12]),P(16,22,'meeting','Huddle 2A',[19]),P(22,28,'meeting','Huddle 2B',[25]),P(28,48,'workspace','Engineering (east)',[32,44])],
  C:centralCommon(P(9,15,'pantry','Tea point',[12],'N'),P(33,39,'wellness','Wellness room',[36],'S')),
  S:[P(0,8,'office','Engineering lead',[4]),P(8,16,'office','Chief architect',[12]),P(16,32,'workspace','Project studio',[20,28]),P(32,40,'meeting','Sprint room',[36]),P(40,48,'lounge','Focus lounge',[44])]},
 {N:[P(0,10,'meeting','Design review',[5]),P(10,26,'workspace','Design studio (west)',[14,22]),P(26,34,'print','Model & print shop',[30]),P(34,48,'workspace','Design studio (east)',[38,44])],
  C:centralCommon(P(9,15,'pantry','Tea point',[12],'N'),P(33,39,'office','People & culture',[36],'S')),
  S:[P(0,16,'workspace','Product team',[5,12]),P(16,24,'meeting','Crit room',[20]),P(24,32,'lounge','Library',[28]),P(32,40,'office','Design director',[36]),P(40,48,'wellness','Quiet room',[44])]},
 {N:[P(0,8,'server','Floor IDF room',[4]),P(8,24,'workspace','Operations floor',[12,20]),P(24,32,'meeting','Ops war room',[28]),P(32,48,'workspace','Finance',[36,44])],
  C:centralCommon(P(9,15,'pantry','Tea point',[12],'N'),P(33,39,'meeting','Focus room',[36],'S')),
  S:[P(0,8,'office','Operations director',[4]),P(8,16,'office','Finance director',[12]),P(16,24,'office','Legal counsel',[20]),P(24,40,'workspace','Sales',[28,36]),P(40,48,'pantry','Sales kitchen',[44])]},
 {N:[P(0,12,'office','CEO office',[8]),P(12,28,'meeting','Boardroom',[16,24]),P(28,36,'office','CFO office',[32]),P(36,48,'lounge','Executive lounge',[42])],
  C:centralCommon(P(9,15,'pantry','Executive pantry',[12],'N'),P(33,39,'office','Executive assistant',[36],'S')),
  S:[P(0,16,'pantry','Sky café',[5,12]),P(16,32,'lounge','Sky lounge',[20,28]),P(32,40,'meeting','Board prep room',[36]),P(40,48,'wellness','Wellness suite',[44])]},
];
export const ENTRANCE={x:24,z:D,f:0,room:'Main lobby'};
export const DOCK={x:13,f:0},RECYCLING={x:9,f:0};

// Interior rectangle (inside wall faces) of a room or corridor.
export function interior(x0,x1,z0,z1){return {x0:x0+(x0===0?EXT_WALL/2:INT_WALL/2),x1:x1-(x1===W?EXT_WALL/2:INT_WALL/2),z0:z0===CORE.z1?CORE.z1:z0+(z0===0?EXT_WALL/2:INT_WALL/2),z1:z1-(z1===D?EXT_WALL/2:INT_WALL/2)};}

// ------------------------------------------------------------------ wall boxes ---
export function wallBoxes(f){
 const e=EXT_WALL/2,i=INT_WALL/2,out=[];const add=(x0,x1,z0,z1,kind='interior',side=null)=>{if(x1-x0>.01&&z1-z0>.01)out.push({x0,x1,z0,z1,y0:0,y1:CEILING,f,kind,side});};
 const prog=PROGRAMME[f];
 // Exterior walls, split around stair openings (1 m) on the end walls.
 const openings=side=>LINKS.filter(l=>l.kind==='stair'&&l.side===side&&linkServes(l,f)).map(l=>l.landing.z).sort((a,b)=>a-b);
 add(-e,W+e,-e,e,'exterior','N');add(-e,W+e,D-e,D+e,'exterior','S');
 for(const side of ['W','E']){let z=e;const x0=side==='W'?-e:W-e,x1=side==='W'?e:W+e;for(const c of openings(side)){add(x0,x1,z,c-.5,'exterior',side);z=c+.5;}add(x0,x1,z,D-e,'exterior',side);}
 // A straight wall at z with door openings; spans [a,b].
 const run=(z,a,b,doors)=>{let x=a;for(const c of doors.filter(c=>c>a&&c<b).sort((p,q)=>p-q)){add(x,c-DOOR_CLEAR/2,z-i,z+i);x=c+DOOR_CLEAR/2;}add(x,b,z-i,z+i);};
 run(8,e,W-e,prog.N.flatMap(r=>r.doors));run(22,e,W-e,prog.S.flatMap(r=>r.doors));
 for(const [a,b]of CENTRAL_SPANS){const inSpan=r=>r.x0>=a&&r.x1<=b;
  if(a!==19)run(12,a-i,b+i,prog.C.filter(r=>inSpan(r)&&r.wall==='N').flatMap(r=>r.doors));
  run(18,a-i,b+i,prog.C.filter(r=>inSpan(r)&&r.wall==='S').flatMap(r=>r.doors));}
 // Partition walls between perimeter rooms and around the central rooms.
 for(const r of prog.N.slice(1))add(r.x0-i,r.x0+i,e,8-i);
 for(const r of prog.S.slice(1))add(r.x0-i,r.x0+i,22+i,D-e);
 for(const x of [3,9,15,19,29,33,39,45])add(x-i,x+i,12+i,18-i);
 // Lift / riser core: solid for physics and sensing; the renderer draws shafts and cars.
 out.push({...CORE,y0:0,y1:CEILING,f,kind:'core',side:null});
 return out;
}

// ------------------------------------------------------------------ furnishing ---
// Room-relative frame: t = distance from the back wall (the wall opposite the corridor door),
// u = world x. "door"/"back" facing means the object's front faces that wall.
class Fit{
 constructor(room,f,idx){Object.assign(this,{room,f,idx});const b=room.bounds;this.ix0=b.x0;this.ix1=b.x1;this.iz0=b.z0;this.iz1=b.z1;this.depth=b.z1-b.z0;this.width=b.x1-b.x0;
  this.doorWall=room.doorWall;this.specs=[];this.boxes=[];this.noWindow=[];this.n=0;this.anchor=null;
  this.keep=room.doors.map(x=>this.box(x-1.05,x+1.05,this.depth-1.9,this.depth+.1));}
 z(t){return this.doorWall==='S'?this.iz0+t:this.iz1-t;}
 tOf(z){return this.doorWall==='S'?z-this.iz0:this.iz1-z;}
 face(dir){const s=this.doorWall==='S';return {door:s?ROT.S:ROT.N,back:s?ROT.N:ROT.S,east:ROT.E,west:ROT.W}[dir];}
 box(x0,x1,t0,t1){const za=this.z(t0),zb=this.z(t1);return {x0,x1,z0:Math.min(za,zb),z1:Math.max(za,zb)};}
 foot(x,z,rot,w,d){const turned=Math.abs(Math.round(rot/(Math.PI/2)))%2===1,fw=turned?d:w,fd=turned?w:d;return {x0:x-fw/2,x1:x+fw/2,z0:z-fd/2,z1:z+fd/2};}
 fits(b,margin=0){if(b.x0<this.ix0-.01||b.x1>this.ix1+.01||b.z0<this.iz0-.01||b.z1>this.iz1+.01)return false;const hit=o=>b.x0<o.x1+margin&&o.x0<b.x1+margin&&b.z0<o.z1+margin&&o.z0<b.z1+margin;return !this.keep.some(o=>b.x0<o.x1&&o.x0<b.x1&&b.z0<o.z1&&o.z0<b.z1)&&!this.boxes.some(hit);}
 // Add one object. Footprints of solid items are recorded for later fit tests.
 add(type,name,x,z,rot,w,d,h,extra={}){const suffix=extra.anchor&&!this.anchor?`furniture-${this.f}-${this.idx}`:`${type}-${++this.n}`;if(suffix.startsWith('furniture-'))this.anchor=suffix;
  const ex={...extra};delete ex.anchor;if(ex.support&&ex.support.startsWith('@'))ex.support=ex.support.slice(1);
  this.specs.push([type,suffix,name,x,z,rot,w,d,h,ex]);if(ex.solid!==false&&ex.y===undefined)this.boxes.push(this.foot(x,z,rot,w,d));return suffix;}
 at(type,name,u,t,dir,w,d,h,extra){return this.add(type,name,u,this.z(t),this.face(dir),w,d,h,extra);}
 tryAt(type,name,u,t,dir,w,d,h,extra,margin=.05){const b=this.foot(u,this.z(t),this.face(dir),w,d);if(!this.fits(b,margin))return null;return this.at(type,name,u,t,dir,w,d,h,extra);}
 // Against a side wall (west/east). along = t of the centre. w is along the wall.
 side(wall,type,name,t,w,d,h,extra={},margin=.05){const x=wall==='west'?this.ix0+d/2+.01:this.ix1-d/2-.01,rot=wall==='west'?ROT.E:ROT.W,z=this.z(t);const b=this.foot(x,z,rot,w,d);if(extra.y===undefined&&extra.solid!==false&&!this.fits(b,margin))return null;return this.add(type,name,x,z,rot,w,d,h,extra);}
 group(x0,x1,t0,t1,margin=.85){const b=this.box(x0,x1,t0,t1);if(!this.fits(b,margin))return false;this.boxes.push(b);return true;}
 small(type,name,x,z,rot,w,d,h,y,support){return this.add(type,name,x,z,rot,w,d,h,{y,support:'@'+support,solid:false});}
}

const DESK={w:1.4,d:.7,h:.74};
function deskWithChair(F,u,t,dir,label,k,opts={}){const other=dir==='door'?'back':'door',sgn=dir==='door'?1:-1;
 const id=F.at('workstation',`Workstation ${label}`,u,t,dir,DESK.w,DESK.d,DESK.h,{zone:'desks',anchor:opts.anchor});
 F.at('office-chair',`Task chair ${label}`,u,t+sgn*.75,other,.6,.6,1.05,{zone:'desks'});
 F.small('monitor',`Monitor ${label}`,u,F.z(t-sgn*.2),F.face(dir),.6,.2,.45,.74,id);
 if(k%3!==2)F.small('keyboard',`Keyboard ${label}`,u,F.z(t+sgn*.17),F.face(dir),.44,.14,.03,.74,id);
 if(k%4===1)F.small('mug',`Coffee mug ${label}`,u+.45,F.z(t+sgn*.12),F.face(dir),.09,.09,.1,.74,id);
 if(k%5===3)F.small('laptop',`Laptop ${label}`,u-.4,F.z(t+sgn*.1),F.face(dir),.32,.22,.02,.74,id);
 return id;}

const GEN={
 workspace(F){let k=0;const tag=F.room.name.split(' ')[0].slice(0,3).toUpperCase();
  // Back-to-back desk clusters centred in the room, leaving wide aisles on the window and door
  // sides (a robot with a 0.43 m radius needs ~1.5 m between chair backs).
  const tc=Math.min(3.45,(F.depth-1.2)/2);let first=true;
  for(let u=F.ix0+1.5;u+2.8<=F.ix1-1.6;u+=4.4){if(!F.group(u,u+2.8,tc-1.42,tc+1.42,.0))continue;for(const j of [0,1]){deskWithChair(F,u+.7+j*1.4,tc-.35,'back',`${tag}-${++k}`,k,{anchor:first});first=false;deskWithChair(F,u+.7+j*1.4,tc+.35,'door',`${tag}-${++k}`,k);}}
  // Low storage credenzas under the windows between clusters.
  for(let u=F.ix0+1.5;u+1.6<=F.ix1-1.6;u+=4.4)F.tryAt('sideboard','Storage credenza',u+1.4,.24,'door',1.6,.45,.75,{zone:'desks'},.3);
  F.side('east','locker','Staff lockers',F.depth-2.9,2.0,.6,1.9,{zone:'lockers'},.6);
  F.side('west','whiteboard','Team whiteboard',tc,1.6,.04,1.1,{y:.95,solid:false});
  for(const u of [F.ix0+.45,F.ix1-.45])F.tryAt('plant','Office plant',u,F.depth-.45,'back',.55,.55,1.5,{},.3);
 },
 meeting(F){const big=F.width>=10,L=Math.max(1.6,Math.min(F.width-3.6,big?7.2:3.6)),w=L>=4?1.3:1.0,uc=(F.ix0+F.ix1)/2,tc=Math.max(w/2+1.2,(F.depth-1.9)/2+.05);
  const table=F.at('conference-table',big?'Boardroom table':'Meeting table',uc,tc,'door',L,w,.75,{zone:'meeting',anchor:true});
  const n=Math.max(1,Math.floor((L-.15)/.85));let c=0;for(let i=0;i<n;i++){const u=uc-(n-1)*.85/2+i*.85;F.at('chair',`Meeting chair ${++c}`,u,tc-(w/2+.38),'door',.5,.55,.9,{zone:'meeting'});F.at('chair',`Meeting chair ${++c}`,u,tc+(w/2+.38),'back',.5,.55,.9,{zone:'meeting'});}
  for(const s of [-1,1]){const u=uc+s*(L/2+.4);if(u-.3>F.ix0+.9&&u+.3<F.ix1-.9)F.add('chair',`Meeting chair ${++c}`,u,F.z(tc),s<0?ROT.E:ROT.W,.5,.55,.9,{zone:'meeting'});}
  F.side('west','tv','Wall display',tc,big?2.0:1.5,.06,big?1.1:.9,{y:1.0,solid:false,zone:'meeting'});
  F.side('east','whiteboard','Meeting whiteboard',tc,1.8,.04,1.1,{y:.95,solid:false});
  if(tc-(w/2+.38)-.3>1.45)F.tryAt('sideboard','Credenza',uc,.24,'door',Math.min(2.4,L*.6),.45,.85,{zone:'meeting'},.4);
  F.small('conference-phone','Conference speakerphone',uc,F.z(tc),0,.28,.28,.05,.75,table);
  F.small('laptop','Presenter laptop',uc+L*.3,F.z(tc),F.face('door'),.32,.22,.02,.75,table);
  F.small('cup','Water glass',uc-L*.3,F.z(tc-.2),0,.08,.08,.12,.75,table);
  for(const u of [F.ix0+.4,F.ix1-.4])F.tryAt('plant','Meeting room plant',u,.4,'door',.5,.5,1.3,{},.15);
 },
 pantry(F){const canon=[[.6,'drawers'],[.6,'doors'],[.6,'dishwasher'],[1,'doors'],[.6,'drawers'],[.76,'doors'],[.6,'drawers'],[.8,'doors'],[.6,'drawers'],[.44,'door']];
  const max=Math.min(6.6,F.width-2.2);let mods=[],Lc=0;for(const m of canon){if(Lc+m[0]>max+1e-9)break;mods.push(m);Lc+=m[0];}Lc=+Lc.toFixed(3);
  const u0=F.ix0+.5,uc=u0+Lc/2,rot=F.face('door');
  const run=F.at('base-cabinets','Base cabinets',uc,.3,'door',Lc,.6,.92,{zone:'counter',modules:mods});
  const runObj={x:uc,z:F.z(.3),rot,y:0},W_=(lx,lz=0)=>toWorld(runObj,lx,0,lz);
  if(mods.length>=3){const p=W_(-Lc/2+1.5,.005);F.add('dishwasher','Dishwasher',p.x,p.z,rot,.6,.58,.86,{zone:'counter',solid:false,support:'@'+run,embedded:true});}
  if(mods.length>=4){const p=W_(-Lc/2+2.3,.005);F.add('sink','Sink',p.x,p.z,rot,.8,.5,.2,{zone:'counter',y:.72,solid:false,support:'@'+run,embedded:true});}
  F.at('upper-cabinets','Upper cabinets',uc,.175,'door',Lc,.35,.75,{zone:'counter',y:1.45,solid:false});F.noWindow.push([u0-.1,u0+Lc+1.1]);
  F.tryAt('refrigerator','Refrigerator',u0+Lc+.5,.38,'door',.9,.75,1.85,{zone:'cold'},.0);
  const items=[['coffee-maker','Espresso machine',Lc/2-.35,.32,.38,.42],['kettle','Electric kettle',-Lc/2+.25,.2,.17,.24],['microwave','Microwave',Lc/2-1.0,.5,.38,.3],['mug','Coffee mug',Lc/2-.8,.09,.09,.1],['cup','Glass cup',-Lc/2+.7,.08,.08,.12]];
  for(const [type,name,lx,w,d,h]of items){if(Math.abs(lx)>Lc/2-.1)continue;const p=W_(lx,-.05);F.small(type,name,p.x,p.z,rot,w,d,h,.92,run);}
  // Island / high table and dining sets in the remaining floor.
  let anchor=null;if(F.depth>=6.5&&F.width<10){const id=F.tryAt('island','High table',uc,3.2,'back',2.0,.9,1.0,{zone:'island',anchor:true},.9);if(id){anchor=id;for(const s of [-.5,.5])F.at('stool','Bar stool',uc+s,4.0,'back',.4,.4,.75,{zone:'island'});F.small('fruit-bowl','Fruit bowl',uc+.3,F.z(3.2),0,.3,.3,.14,1.0,id);}}
  let d=0;for(let u=F.ix0+1.0;u+1.6<=F.ix1-.9;u+=2.9)for(const t of F.depth>=6.5?[2.55,4.75]:[F.depth/2+.6]){if(!F.group(u-.1,u+1.7,t-1.1,t+1.1,.6))continue;const id=F.at('dining-table',`Café table ${++d}`,u+.8,t,'door',1.6,.9,.75,{zone:'dining',anchor:!anchor});anchor??=id;
    for(const s of [-.4,.4]){F.at('chair','Café chair',u+.8+s,t-.8,'door',.45,.5,.85,{zone:'dining'});F.at('chair','Café chair',u+.8+s,t+.8,'back',.45,.5,.85,{zone:'dining'});}if(d%2)F.small('cup','Water glass',u+.6,F.z(t),0,.08,.08,.12,.75,id);}
  F.side('east','vending-machine','Vending machine',1.0,.9,.8,1.85,{},.2);F.side('east','water-cooler','Water cooler',2.1,.35,.35,1.1,{},.2);
  F.side('west','pantry-cabinet','Snack cabinet',F.depth-2.6,1.2,.6,2.2,{},.3);
  F.tryAt('trash-bin','Trash bin',F.ix1-.3,F.depth-.25,'back',.4,.35,.65,{zone:'waste'},.0)??F.tryAt('trash-bin','Trash bin',F.ix0+.3,F.depth-.25,'back',.4,.35,.65,{zone:'waste'},.0);
  F.tryAt('trash-bin','Recycling bin',F.ix1-.75,F.depth-.25,'back',.4,.35,.65,{zone:'waste'},.0);
  if(!F.anchor){const id=`furniture-${F.f}-${F.idx}`;F.specs.find(s=>s[1]===run)[1]=F.anchor=id;for(const s of F.specs)if(s[9]?.support===run)s[9].support=id;}
 },
 print(F){let u=F.ix0+.4;const add=(type,name,w,d,h,zone='print',anchor=false)=>{if(u+w>F.ix1-.3)return null;const id=F.tryAt(type,name,u+w/2,d/2+.04,'door',w,d,h,{zone,anchor},.0);u+=w+.35;return id;};
  add('printer','Multifunction printer',1.0,.75,1.2,'print',true);add('printer','Plotter printer',.7,.6,.95);add('shredder','Paper shredder',.5,.4,.7);if(F.width>8)add('tall-cabinet','Stationery cabinet',1.2,.6,2.1,'supplies');F.noWindow.push([F.ix0,u]);
  const shelf=F.side('west','shelf-unit','Supply shelving',F.depth>4?2.4:1.4,1.2,.4,1.8,{zone:'supplies'},.2);
  if(shelf){const s=F.specs.find(x=>x[1]===shelf);F.small('paper-ream','Paper reams',s[3],s[4],s[5],.3,.22,.12,1.0,shelf);}
  const tc=Math.min(2.6,F.depth-2.2);if(tc>1.6){const t=F.tryAt('conference-table','Sorting table',(F.ix0+F.ix1)/2+1.2,tc,'door',1.6,.8,.9,{zone:'print'},.9);if(t)F.small('paper-ream','Paper ream',(F.ix0+F.ix1)/2+1.4,F.z(tc),0,.3,.22,.06,.9,t);}
  F.tryAt('trash-bin','Paper recycling bin',F.ix1-.3,.25,'door',.45,.4,.7,{},.0);
  if(F.depth>4){F.side('east','vacuum','Upright vacuum',F.depth-2.4,.3,.3,1.1,{zone:'cleaning'},.1);F.side('east','mop-bucket','Mop and bucket',F.depth-2.9,.36,.36,1.2,{zone:'cleaning'},.05);}
 },
 reception(F){F.keep.push(F.box(22.4,25.6,0,F.depth+.1));
  const desk=F.at('reception-desk','Reception desk',29.4,3.3,'back',2.8,.8,1.05,{zone:'reception',anchor:true});
  F.at('office-chair','Receptionist chair',29.4,4.15,'back',.6,.6,1.05,{zone:'reception'});F.small('monitor','Reception monitor',29.1,F.z(3.45),F.face('back'),.55,.18,.42,1.05,desk);
  const sofa=F.at('sofa','Waiting sofa',18.8,.48,'door',2.2,.9,.82,{zone:'waiting'});void sofa;const ct=F.at('coffee-table','Waiting table',18.8,1.75,'door',1.1,.55,.4,{zone:'waiting'});F.small('books','Magazines',18.6,F.z(1.75),0,.3,.22,.04,.4,ct);
  F.at('armchair','Waiting armchair',17.25,2.0,'east',.85,.85,.9,{zone:'waiting'});F.at('armchair','Waiting armchair',20.35,2.0,'west',.85,.85,.9,{zone:'waiting'});
  F.at('sofa','Lobby bench sofa',30.4,.48,'door',2.2,.9,.82,{zone:'waiting'});
  F.at('rug','Entrance mat',24,.55,'door',1.6,1.0,.012,{solid:false});F.at('rug','Lobby rug',18.8,1.4,'door',3.4,2.4,.012,{solid:false,zone:'waiting'});
  F.tryAt('coat-rack','Coat rack',21.6,.3,'door',.45,.45,1.8,{zone:'reception'},.0);F.tryAt('umbrella-stand','Umbrella stand',26.2,.2,'door',.25,.25,.5,{},.0);
  for(const [u,t]of [[16.5,.4],[31.5,2.2],[16.5,5.6]])F.tryAt('plant','Lobby plant',u,t,'door',.6,.6,1.6,{},.2);
 },
 lounge(F){let g=0;for(let u=F.ix0+1.2;u+2.2<=F.ix1-1.2;u+=5.0){if(!F.group(u-1.0,u+3.2,0,2.6,.6))continue;const uc=u+1.1;g++;
   const s=F.at('sofa','Lounge sofa',uc,.5,'door',2.2,.95,.85,{zone:'lounge',anchor:true});void s;const ct=F.at('coffee-table','Lounge coffee table',uc,1.75,'door',1.1,.6,.42,{zone:'lounge'});
   F.add('armchair','Lounge armchair',uc-1.6,F.z(1.9),ROT.E,.85,.85,.9,{zone:'lounge'});F.add('armchair','Lounge armchair',uc+1.6,F.z(1.9),ROT.W,.85,.85,.9,{zone:'lounge'});
   F.at('rug','Lounge rug',uc,1.5,'door',2.8,1.8,.012,{solid:false,zone:'lounge'});if(g%2)F.small('mug','Coffee mug',uc+.2,F.z(1.75),0,.09,.09,.1,.42,ct);else F.small('books','Coffee-table books',uc-.2,F.z(1.75),0,.3,.22,.06,.42,ct);}
  if(F.width>=8){F.side('east','phone-booth','Phone booth',F.depth-3.1,1.0,1.0,2.2,{zone:'booths'},.3);F.side('east','phone-booth','Phone booth',F.depth-4.3,1.0,1.0,2.2,{zone:'booths'},.0);}
  F.side('west','bookshelf','Bookshelf',3.6,1.8,.35,2.0,{zone:'library'},.3);
  for(const [u,t]of [[F.ix0+.4,.4],[F.ix1-.4,.4]])F.tryAt('plant','Monstera',u,t,'door',.6,.6,1.4,{},.1);
 },
 office(F){const uc=F.ix0+Math.min(F.width/2,3.0);
  const desk=F.at('desk','Executive desk',uc,.95,'door',1.8,.8,.75,{zone:'exec',anchor:true});F.at('office-chair','Executive chair',uc,1.8,'back',.65,.65,1.15,{zone:'exec'});
  F.small('monitor','Monitor',uc,F.z(.75),F.face('door'),.6,.2,.45,.75,desk);F.small('keyboard','Keyboard',uc,F.z(1.1),F.face('door'),.44,.14,.03,.75,desk);F.small('mug','Tea mug',uc+.6,F.z(1.05),0,.09,.09,.1,.75,desk);
  F.tryAt('tall-cabinet','File cabinet',uc-1.35,.32,'door',.45,.6,.7,{zone:'exec'},.0);
  F.side('west','bookshelf','Office bookshelf',2.6,1.8,.35,2.0,{zone:'library'},.3);
  const mt=F.width>=5.5?(F.ix1-1.5):null;if(mt){const t=Math.min(3.4,F.depth-2.6);const id=F.tryAt('conference-table','Small meeting table',mt,t,'door',.9,.9,.74,{zone:'meet'},.6);if(id){F.at('chair','Guest chair',mt,t-.8,'door',.5,.55,.9,{zone:'meet'});F.at('chair','Guest chair',mt,t+.8,'back',.5,.55,.9,{zone:'meet'});}}
  F.at('rug','Office rug',uc,2.2,'door',2.4,1.7,.012,{solid:false});F.tryAt('plant','Office plant',F.ix1-.4,.4,'door',.5,.5,1.3,{},.1);
 },
 server(F){const n=Math.min(9,Math.floor((F.width-2.4)/.6));let first=true;for(const [t,dir]of [[.6,'door'],[F.depth>=6?3.05:null,'back']]){if(t===null)continue;for(let i=0;i<n;i++){const u=F.ix0+.9+i*.6+.3;F.tryAt('server-rack',i===n-1?'Network rack':'Server rack',u,t,dir,.6,1.07,2.0,{zone:'racks',anchor:first},.0);first=false;}}
  F.noWindow.push([F.ix0,F.ix1]);F.tryAt('ups','UPS battery cabinet',F.ix0+.9+n*.6+.4,.4,'door',.5,.7,1.0,{zone:'racks'},.0);
  const bench=F.side('east','workstation','IT workbench',F.depth-2.6,1.6,.75,.9,{zone:'it'},.4);if(bench){const s=F.specs.find(x=>x[1]===bench);F.add('office-chair','IT stool',s[3]-.75,s[4],ROT.E,.55,.55,.95,{zone:'it'});F.small('laptop','Service laptop',s[3],s[4],ROT.W,.32,.22,.02,.9,bench);}
  F.side('west','shelf-unit','Spare parts shelving',F.depth-2.6,1.6,.4,1.8,{},.3);
 },
 restroom(F){const n=Math.max(2,Math.floor((F.width-1.2)/1.1));for(let i=0;i<n;i++)F.tryAt('toilet',`Toilet (stall ${i+1})`,F.ix0+.75+i*1.1,.36,'door',.4,.7,.78,{zone:'toilet'},.0);
  const t=F.depth-1.35,van=F.side('west','vanity','Washbasin counter',t,1.6,.55,.85,{zone:'grooming',anchor:true},.0);
  if(van){const s=F.specs.find(x=>x[1]===van);F.add('mirror','Restroom mirror',F.ix0+.02,s[4],ROT.E,1.4,.03,.9,{y:1.1,solid:false,zone:'grooming'});F.small('toiletries','Soap dispenser',s[3]-.05,s[4]+.4,ROT.E,.12,.12,.18,.85,van);}
  F.side('west','hand-dryer','Hand dryer',Math.max(.8,t-1.4),.3,.2,.4,{y:1.0,solid:false,zone:'grooming'});
  F.side('east','tall-cabinet','Janitor cabinet',t,.6,.4,1.8,{},.0);F.side('east','trash-bin','Paper towel bin',t-.9,.35,.3,.6,{zone:'grooming'},.0);
 },
 wellness(F){F.tryAt('treadmill','Treadmill',F.ix0+1.0,1.1,'door',.85,1.95,1.4,{zone:'cardio',anchor:true},.0);F.tryAt('exercise-bike','Exercise bike',F.ix0+2.3,.7,'door',.55,1.1,1.2,{zone:'cardio'},.0);
  F.tryAt('weight-bench','Weight bench',F.ix0+4.2,.9,'door',1.2,.45,.45,{zone:'strength'},.3);
  const rack=F.side('east','dumbbell-rack','Dumbbell rack',1.4,1.0,.4,.8,{zone:'strength'},.0);if(rack){const s=F.specs.find(x=>x[1]===rack);F.small('dumbbells','Dumbbell set',s[3],s[4],ROT.W,.9,.3,.15,.8,rack);}
  F.at('rug','Yoga mat',F.ix0+Math.min(4.5,F.width-1.6),3.2,'door',1.8,.6,.008,{solid:false});F.side('west','mirror','Wellness mirror',3.2,1.6,.03,1.6,{y:.5,solid:false});
  F.side('east','tall-cabinet','Towel cabinet',3.0,1.0,.35,1.2,{},.2);
 },
};

// Light switch, sensor hub and outlet on the inside face of the door wall.
function services(F){const d=F.room.doors[0],sgnFace=F.doorWall==='S'?-1:1,wallZ=F.doorWall==='S'?F.iz1:F.iz0;const rot=F.doorWall==='S'?ROT.N:ROT.S;
 const clampU=u=>Math.max(F.ix0+.3,Math.min(F.ix1-.3,u));const hx=clampU(d+1.6<F.ix1-.3?d+1.6:d-1.6),sx=clampU(d+.75<F.ix1-.3?d+.75:d-.75),ox=clampU(d-2.4>F.ix0+.3?d-2.4:d+2.4);
 F.add('hub',`${F.room.name} sensor hub`,hx,wallZ+sgnFace*.02,rot,.12,.03,.12,{y:1.45,solid:false});
 F.add('switch',`${F.room.name} light switch`,sx,wallZ+sgnFace*.01,rot,.08,.015,.12,{y:1.15,solid:false});
 F.add('outlet',`${F.room.name} outlet`,ox,wallZ+sgnFace*.01,rot,.08,.015,.08,{y:.3,solid:false});}

// Windows along the exterior walls of perimeter rooms, skipping tall back-wall casework.
function windowsFor(F,band,f,out){const r=F.room,sill=.9,head=2.55;const blocked=c=>F.noWindow.some(([a,b])=>c+1>a&&c-1<b);
 const side=band==='N'?'N':'S';const span=r.x1-r.x0,n=Math.max(1,Math.floor((span-1.0)/3.2));
 for(let i=0;i<n;i++){const c=+(r.x0+span*(i+.5)/n).toFixed(2);if(f===0&&side==='S'&&Math.abs(c-ENTRANCE.x)<2.6)continue;if(blocked(c))continue;out.push([f,side,c,Math.min(2.2,span/n-1.0),sill,head,r.id]);}
 if(f===0&&side==='S'&&r.name===ENTRANCE.room)for(const c of [21.5,26.5])out.push([f,'S',c,1.4,.1,head,r.id]);
 for(const [edge,s]of [[0,'W'],[W,'E']])if(r.x0===edge||r.x1===edge){const zc=(BANDS[band].z0+BANDS[band].z1)/2;out.push([f,s,zc,1.8,sill,head,r.id]);}}

// Build every room, its furniture specs and the window list for the whole building.
export function buildProgramme(){const rooms=[],specs=[],windows=[];
 for(let f=0;f<FLOORS;f++){let i=0;const prog=PROGRAMME[f];
  const make=(r,band)=>{const z0=band==='C'?(r.x0===19?CORE.z1:12):BANDS[band].z0,z1=band==='C'?18:BANDS[band].z1;
   const doorWall=band==='C'?(r.wall==='N'?'N':'S'):BANDS[band].doorWall;
   const doorZ=band==='C'?(r.wall==='N'?12:18):BANDS[band].doorZ,corridor=band==='C'?(r.wall==='N'?'n':'s'):BANDS[band].corridor;
   const id=`room-${f}-${i}`,room={id,idx:i++,name:r.name,type:r.type,kind:'room',band,f,x0:r.x0,x1:r.x1,z0,z1,x:(r.x0+r.x1)/2,z:(z0+z1)/2,bounds:interior(r.x0,r.x1,z0,z1),doors:r.doors,doorWall,doorZ,corridor:`corridor-${f}-${corridor}`};
   room.minX=Math.ceil(room.bounds.x0+.3);room.maxX=Math.floor(room.bounds.x1-.3);room.minZ=Math.ceil(room.bounds.z0+.3);room.maxZ=Math.floor(room.bounds.z1-.3);
   const F=new Fit(room,f,room.idx);GEN[r.type](F);services(F);room.anchor=F.anchor;rooms.push(room);specs.push(...F.specs.map(s=>({room:id,f,spec:s})));if(band!=='C')windowsFor(F,band,f,windows);};
  for(const r of prog.N)make(r,'N');for(const r of prog.C)make(r,'C');for(const r of prog.S)make(r,'S');
  for(const c of CORRIDORS){const b=interior(0,W,c.z0,c.z1);rooms.push({id:`corridor-${f}-${c.id}`,name:`L${f+1} ${c.name.toLowerCase()}`,type:'corridor',kind:'corridor',f,x0:0,x1:W,z0:c.z0,z1:c.z1,x:W/2,z:(c.z0+c.z1)/2,bounds:b,minX:1,maxX:W-1,minZ:c.z0+1,maxZ:c.z1-1,doors:[]});}
  PASSAGES.forEach(([a,b],k)=>{const bb={x0:a===0?EXT_WALL/2:a+INT_WALL/2,x1:b===W?W-EXT_WALL/2:b-INT_WALL/2,z0:12+INT_WALL/2,z1:18-INT_WALL/2};rooms.push({id:`passage-${f}-${k}`,name:`L${f+1} cross passage ${k+1}`,type:'corridor',kind:'corridor',f,x0:a,x1:b,z0:12,z1:18,x:(a+b)/2,z:15,bounds:bb,minX:Math.ceil(bb.x0+.3),maxX:Math.floor(bb.x1-.3),minZ:13,maxZ:17,doors:[]});});
  // Corridor dressing: notice boards and runners (non-obstacles).
  specs.push({room:`corridor-${f}-n`,f,spec:['whiteboard','notice-board','Notice board',6.5,8+INT_WALL/2+.02,ROT.S,1.2,.03,.8,{y:1.1,solid:false}]});
  specs.push({room:`corridor-${f}-s`,f,spec:['whiteboard','notice-board','Notice board',40.5,22-INT_WALL/2-.02,ROT.N,1.2,.03,.8,{y:1.1,solid:false}]});
  for(const [id,z]of [[`corridor-${f}-n`,10],[`corridor-${f}-s`,20]])for(const x of [12,36])specs.push({room:id,f,spec:['rug',`runner-${x}`,'Corridor runner',x,z,ROT.S,10,1.0,.01,{solid:false}]});
 }
 return {rooms,specs,windows};
}
