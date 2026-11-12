import {W,D,H,FLOORS,EYE,key,point,distance,createWorld,route,linkPosition,linkLength,linkById,LINK_AT,linkTargets} from './world.mjs?v=20261112v';
import {OccupancyMap,Localizer,robotPerceive,RES} from './mapping.mjs?v=20261112v';
import {SemanticBelief,detectObjects,groundTruthGraph,ROOM_LABELS} from './semantics.mjs?v=20261112v';
import {defaultGenome,prng,zoneSites,ZONE_KINDS} from './env.mjs?v=20261112v';
import {conditionsAt,solarEffects} from './realworld.mjs?v=20261112v';
import {geodesic} from './metrics.mjs?v=20261112v';
const NAMES=['Alex','Priya','Sam','Jordan','Lee','Maya','Omar','Chen','Rosa','Kai','Noor','Ivan','Zoe','Tariq','Ana','Ben'];
const STAFF_SPOTS=[[6,10],[38,20],[18,10],[40,10],[10,20],[34,10],[30,20],[8,10],[18,20],[40,20],[14,20],[44,10],[36,10],[4,20],[42,20],[16,10]];
// Default real-world clock: a weekday morning at the site (overridable with opts.clockStart).
export const DEFAULT_CLOCK=Date.UTC(2026,10,12,14,0);
export const taskNames={trash:'Collect litter',surface:'Clean floor spills',tidy:'Review furniture',temperature:'Check temperature',lights:'Switch off empty rooms',patrol:'Patrol the building',dock:'Return to dock',dispose:'Empty waste bin'};
const colors=['#39c9b0','#f0aa71','#b7a5e1','#e9cb70','#b9b3aa','#efb48f','#9db79c','#d98fa0','#8fb3d9','#c9a46b','#7fc2a4','#e0a3d0'];
const LANDMARK_TYPES=new Set(['hub','dock','bin','stairs','elevator']);
export class Simulation{
 constructor(genome=defaultGenome(),opts={}){this.genome=genome;this.opts=opts;this.weather=opts.weather??null;this.clockStart=new Date(opts.clockStart??DEFAULT_CLOCK);this.timeScale=opts.timeScale??20;this.reset();}
 reset(){this.world=createWorld(this.genome);this.rng=prng(this.genome.seed);this.trips=[];this.failedTrips=0;this.energyUsed=0;this.nextLitter=40+this.rng.u()*40;this.nextSpill=90+this.rng.u()*90;this.spills=[];this.envClock=-1;this.lastEnvUpdate=-1e9;this._count=null;this.time=0;this.running=false;this.speed=1;this.auto=true;this.tasks=[];this.done=[];this.events=[];this.counter=0;this.coverage=0;this.avoids=0;this.scans=0;this.collisions=0;this.carry=0;this.battery=100;this.lastSense=0;
  this.agents=[];
  const dock=this.world.object('dock').access;this.home={x:dock.x,z:dock.z,f:0};
  // MOMO starts on its dock; ten staff start in corridors on all five floors; the office dog on L1.
  const specs=[['MOMO','robot',dock.x,dock.z,0]];for(let i=0;i<(this.genome.staff??10);i++){const f=Math.floor(i/2)%FLOORS;let [x,z]=STAFF_SPOTS[i%STAFF_SPOTS.length];for(let k=0;k<20&&(this.world.navBlocked(x,z,f)||LINK_AT.has(key(x,z,f))||specs.some(p=>p[4]===f&&Math.hypot(p[2]-x,p[3]-z)<2.5));k++)x=x+2>W-3?3:x+2;specs.push([NAMES[i%NAMES.length],'human',x,z,f]);}specs.push(['Biscuit','dog',31,10,0]);
  specs.forEach(([name,type,x,z,f],i)=>this.agents.push({id:`agent-${i}`,name,type,x,z,f,heading:0,color:colors[i%colors.length],range:type==='robot'?6.5:type==='human'?5:4,fov:(type==='robot'?105:type==='human'?115:130)*Math.PI/180,memory:new Map(),landmarks:new Map(),seen:new Map(),objectMemory:new Map(),path:[],trail:[],distance:0,status:'Ready to start',goal:null,dwell:0,scan:0,nextThink:0,stair:null,reuse:0,yields:0}));
  this.robot=this.agents[0];Object.assign(this.robot,{map:new OccupancyMap(),localizer:new Localizer({x:dock.x,z:dock.z,heading:0,f:0}),belief:new SemanticBelief(),bumps:new Map(),lastScan:null,doorState:new Map(),roomLabels:new Map()});this.graph={nodes:[],edges:[]};this.graphTime=-1;this.perf={senseMs:0,graphMs:0,senses:0};
  for(const a of this.agents)a.eye=EYE[a.type];
  this.rememberLandmark(this.robot,this.world.objects.find(o=>o.id==='dock'));this.updateEnvironment(true);this.log('System','Press Start: perceive → map → discover tasks → act');
 }
 log(who,msg){this.events.unshift({time:this.time,who,msg});this.events=this.events.slice(0,70);}
 rememberLandmark(a,o){if(!a.landmarks.has(o.id)){const p=this.world.servicePoint(o),h=this.home;a.landmarks.set(o.id,{id:o.id,name:o.name,type:o.type,link:o.link,x:p.x,z:p.z,f:o.f,ox:o.x,oz:o.z,relative:[p.x-h.x,p.z-h.z,o.f*H],visits:1});if(a===this.robot)this.log(a.name,`Landmark saved: ${o.name} (relative to dock)`);}}
 canSee(a,p,toY=null){if(a.stair||a.f!==p.f||distance(a,p)>a.range)return false;if(distance(a,p)<.6)return true;const angle=Math.atan2(p.z-a.z,p.x-a.x),delta=Math.atan2(Math.sin(angle-a.heading),Math.cos(angle-a.heading));return Math.abs(delta)<a.fov/2&&this.world.visible(a,p,null,toY);}
 sense(a){
  if(a===this.robot&&!a.stair){this.robotSense(a);return;}
  // People and pets keep the original idealised perception: a visible cell reveals its true state.
  for(let x=Math.max(0,Math.floor(a.x-a.range));x<=Math.min(W,Math.ceil(a.x+a.range));x++)for(let z=Math.max(0,Math.floor(a.z-a.range));z<=Math.min(D,Math.ceil(a.z+a.range));z++){
   const p={x,z,f:a.f};if(this.canSee(a,p,this.world.surfaceHeight(x,z,a.f)+.01))a.memory.set(key(x,z,a.f),{blocked:this.world.navBlocked(x,z,a.f),occupied:this.world.blocked(x,z,a.f),time:this.time,zone:this.world.areaAt(x,z,a.f)?.kind});
  }
  for(const b of this.agents)if(b!==a&&this.canSee(a,b))a.seen.set(b.id,{x:b.x,z:b.z,f:b.f,time:this.time,name:b.name,type:b.type});
  for(const o of this.world.objects)if(o.active!==false&&o.f===a.f&&(LANDMARK_TYPES.has(o.type)||a.type==='human'&&o.id.startsWith('furniture-'))&&this.canSee(a,{x:o.x,z:o.z,f:o.f,owner:o.id},(o.y??0)+Math.min(o.h,1)/2)){a.objectMemory.set(o.id,{...o,time:this.time});this.rememberLandmark(a,o);}
 }
 // Robot: simulated LiDAR + RGB-D -> pose estimate -> occupancy map -> detections -> belief.
 robotSense(a){
  const t0=globalThis.performance?.now?.()??0;this.world.sync();
  a.lastScan=robotPerceive(this.world,a,a.map,a.localizer,this.time);
  const est=a.lastScan.pose,dth=est.heading-a.heading,c=Math.cos(dth),s=Math.sin(dth);
  const delta=(x,z)=>{const rx=x-a.x,rz=z-a.z,px=est.x+rx*c-rz*s,pz=est.z+rx*s+rz*c;return {x:px,z:pz,dx:px-x,dz:pz-z};};
  a.belief.recordCovisibility(a,a.lastScan.depth.floorPts);
  const ar=this.world.areaAt(a.x,a.z,a.f),det=detectObjects(this.world,a,a.fov,ar?.sensing??1);
  // Floor markings (wet-floor signs, lanes, directories) inside the camera's reach are remembered.
  for(const [k,m]of a.memory)if(m.time===this.time){const p=point(k);if(p.f===a.f&&Math.hypot(p.x-a.x,p.z-a.z)<=6.5){m.zone=this.world.areaAt(p.x,p.z,p.f)?.kind;}}a.belief.integrate(this.world,a,det,this.time,delta);a.lastDetections=det.detections.filter(d=>!d.occluded).map(d=>d.o.id);
  for(const b of this.agents)if(b!==a&&this.canSee(a,b))a.seen.set(b.id,{x:b.x,z:b.z,f:b.f,time:this.time,name:b.name,type:b.type});
  for(const d of det.detections){if(d.occluded)continue;const o=d.o,old=a.objectMemory.get(o.id);a.objectMemory.set(o.id,{...o,time:this.time});
   if(LANDMARK_TYPES.has(o.type))this.rememberLandmark(a,o);
   if(['trash','surface'].includes(o.type)&&this.auto)this.enqueue(o.type,o.id,false);
   if(o.type==='door'){const k=key(o.x,o.z,o.f),m=a.memory.get(k);if(m)m.door=o.id;const prev=a.doorState.get(o.id),now=o.open?'open':'closed';if(prev&&prev!==now)this.log(a.name,now==='closed'?`${o.name} closed: marked as a temporarily blocked doorway, not a wall`:`${o.name} open again: doorway traversable`);a.doorState.set(o.id,now);if(now==='open'&&prev==='closed'){for(const t of this.tasks)if(t.state==='Waiting for access')t.retryAt=this.time;}}
   if(o.solid&&old&&(Math.abs(old.x-o.x)>.05||Math.abs(old.z-o.z)>.05)){this.log(a.name,`Position changed: ${o.name}; updating obstacle memory`);if(o.baseline){o.moved=true;this.rememberLandmark(a,{...o,name:`${o.name} position change`});if(this.auto)this.enqueue('tidy',o.id,false);}}
   if(o.type==='hub'){const r=this.world.rooms.find(r=>r.id===o.room);if(this.auto&&r.lastSample===null)this.enqueue('temperature',o.id,false);if(this.auto&&r.light)this.enqueue('lights',o.id,false);}
  }
  this.scans++;this.perf.senseMs+=(globalThis.performance?.now?.()??0)-t0;this.perf.senses++;
  if(this.time-this.graphTime>=Math.max(1,this.perf.graphMs/20))this.refreshGraph();
 }
 refreshGraph(){if(this.opts.lite)return;const a=this.robot,t0=globalThis.performance?.now?.()??0;this.graph=a.belief.graph(a,this.time);this.graphTime=this.time;
  for(const r of a.belief.regions.values()){const prev=a.roomLabels.get(r.id);if(r.label!=='unknown'&&prev!==r.label&&r.confidence>=.35){a.roomLabels.set(r.id,r.label);this.log(a.name,`Recognised ${r.name} (${Math.round(r.confidence*100)}% from ${r.objects.length} observed objects)`);}}
  for(const e of a.belief.log.splice(0))if(!e.door)this.log('Belief',e.msg);
  this.perf.graphMs=(globalThis.performance?.now?.()??0)-t0;}
 groundTruth(){return groundTruthGraph(this.world);}
 enqueue(type,target=null,manual=true){
  if(type==='patrol'){this.robot.goal=null;this.robot.path=[];this.robot.scan=0;this.log('Command','Continue exploring unobserved space');return;}
  if(type==='dock')target='dock';
  if(!target){const candidates=[...this.robot.objectMemory.values()].filter(o=>type==='temperature'||type==='lights'?o.type==='hub':type==='tidy'?o.solid&&o.moved:o.type===type&&o.active!==false);if(!candidates.length){this.log('Command','No known target yet. Keep exploring before assigning this task.');return;}for(const o of candidates)this.enqueue(type,o.id,manual);return;}
  if(this.tasks.some(t=>t.type===type&&t.target===target))return;
  const t={id:++this.counter,type,target,manual,state:'Queued',created:this.time,progress:0};if(manual)this.tasks.splice(this.tasks[0]?.state==='In progress'?1:0,0,t);else this.tasks.push(t);this.log(manual?'Command':'Discovered',`${taskNames[type]} · ${this.world.objects.find(o=>o.id===target)?.name??target}`);
 }
 setGoal(a,p,label){a.goal={...p,label};a.path=[];a.nextThink=0;if(a!==this.robot&&/^(Heading to|Revisiting|Looking for)/.test(label))a.trip={t0:this.time,from:{x:a.x,z:a.z,f:a.f},to:{x:p.x,z:p.z,f:p.f},label};else a.trip=null;}
 // Vertical links an agent has seen (a stair landing or lift lobby is a remembered landmark).
 knownLinks(a){const s=new Set();for(const l of a.landmarks.values())if(l.link)s.add(l.link);return s;}
 // Floors the agent believes it can reach through the links it knows (transitively).
 reachableFloors(a,links=this.knownLinks(a)){const out=new Set([a.f]),q=[a.f];while(q.length){const f=q.pop();for(const id of links){const l=linkById(id);for(const g of linkTargets(l,f))if(!out.has(g)){out.add(g);q.push(g);}}}return out;}
 plan(a){if(!a.goal)return;const target=a.goal,links=this.knownLinks(a),knownStairs=links.size?links:false;
  const nearby=a===this.robot?this.agents.filter(b=>b.type==='human'&&!b.stair&&b.f===a.f&&distance(a,b)<3.5):this.time<(a.ignoreRobotUntil??0)&&!this.robot.stair&&this.robot.f===a.f?[this.robot]:[];
  const robot=a===this.robot,bumps=a.bumps??new Map();
  // Cells the robot has physically driven through recently are passable whatever the map says
  // (it may have entered a tight aisle before seeing the chairs that now flank it).
  const driven=new Set();if(robot)for(let i=Math.max(0,a.trail.length-400);i<a.trail.length;i++){const p=a.trail[i];if(p.f===a.f)driven.add(key(p.x,p.z,p.f));}
  const sk=key(a.x,a.z,a.f),edge=robot?(c,n)=>{if(driven.has(c)&&driven.has(n))return false;const p=c===sk?{x:a.x,z:a.z,f:a.f}:point(c),q=point(n);return p.f===q.f&&a.map.edgeBlocked(p,q,p.f,c===sk?.16:.22,c===sk);}:(c,n)=>{const q=point(n);if(q.f!==point(c).f)return false;return c===sk?!this.world.segmentClear({x:a.x,z:a.z,f:a.f},q,.16):a.memory.has(c)&&a.memory.has(n)&&!this.world.edgeClear(c,n);};
  const zc=k=>{const z=a.memory.get(k)?.zone;return z?1/ZONE_KINDS[z].speed:1;};const path=route(a,target,k=>a.memory.get(k)?.blocked===true&&!driven.has(k)||this.time-(bumps.get(k)??-99)<20||nearby.some(b=>distance(point(k),b)<1.3),knownStairs,edge,zc);a.path=path??[];if(path?.length===0&&distance(a,target)>.01)a.path=[{x:target.x,z:target.z,f:target.f}];a.nextThink=this.time+2;
  if(path===null&&robot){a.failCount=(a.failCount??0)+1;
   // Recovery: after repeated planning failures in the same spot, back out along the robot's own
   // recent trajectory (space it has physically occupied) before trying again.
   if(a.failCount>=4&&a.trail.length>8){const back=[];let acc=0,prev={x:a.x,z:a.z};for(let i=a.trail.length-1;i>=0&&acc<4.5;i--){const p=a.trail[i];if(p.f!==a.f)break;const d=Math.hypot(p.x-prev.x,p.z-prev.z);if(d>.35){acc+=d;back.push({x:p.x,z:p.z,f:p.f});prev=p;}}
    if(back.length&&back.every((p,i)=>this.world.segmentClear(i?back[i-1]:a,p,.1))){a.failCount=0;a.path=back;a.yieldRoute=true;a.nextThink=Infinity;a.goal={...back.at(-1),label:'Recovery: backing out'};this.log(a.name,'Recovery: backing out along its own trajectory');return;}}}
  else if(robot)a.failCount=0;
  if(path===null){a.yieldRoute=false;a.retreatForHuman=false;a.visited??=new Map();const k=key(target.x,target.z,target.f);a.visited.set(k,(a.visited.get(k)??0)+5);if(target.taskId){const t=this.tasks.find(t=>t.id===target.taskId);if(t){t.fails=(t.fails??0)+1;t.retryAt=this.time+Math.min(120,12*2**Math.min(4,t.fails-1));t.state='Waiting for access';}}if(a.trip){this.failedTrips++;a.trip=null;}a.goal=null;a.status='Target blocked; exploring another area';}}
 explore(a){
  const links=this.knownLinks(a),floors=this.reachableFloors(a,links),visitedFloor=f=>[...a.memory.keys()].some(k=>k.endsWith(`,${f}`));
  // An unvisited floor reached by a known stair or lift: the landing there is one large frontier.
  const newFloor=()=>{let best=null,score=-Infinity;for(const f of floors){if(f===a.f||visitedFloor(f))continue;for(const id of links){const l=linkById(id);if(!(f>=l.floors[0]&&f<=l.floors[1]))continue;const s=10-distance(a,{...l.landing,f:a.f})-3*Math.abs(f-a.f)-(l.kind==='stair'?2*Math.abs(f-a.f):0);if(s>score){score=s;best={x:l.landing.x,z:l.landing.z,f,size:'new floor',via:l.name};}}}return best&&{best,score};};
  if(a===this.robot&&a.map){
   // Frontier-based exploration on the robot's own 0.25 m occupancy grid.
   let best=null,score=-Infinity;
   for(const f of [a.f,...[...floors].filter(f=>f!==a.f)]){const stay=best&&best.f===a.f&&best.size>=10&&score>-8;if(f!==a.f&&stay)break;if(f!==a.f){const nf=newFloor();if(nf&&nf.score>score-(best?.f===a.f?8:0)){best=nf.best;score=nf.score;}}
    if(f!==a.f&&!visitedFloor(f))continue;
    for(const fr of a.map.frontiers(f)){let target=null,td=Infinity;
     for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){const x=Math.round(fr.x)+dx,z=Math.round(fr.z)+dz,k=key(x,z,f),m=a.memory.get(k);if(!m||m.blocked||this.time-(a.bumps.get(k)??-99)<20)continue;const d=Math.hypot(x-fr.x,z-fr.z);if(d<td){td=d;target={x,z,f};}}
     if(!target)continue;const k=key(target.x,target.z,f),s=Math.min(fr.size,40)*.45-distance(a,target)-12*Math.abs(f-a.f)-((a.visited?.get(k)??0)*5)-td;if(s>score){score=s;best={...target,size:fr.size};}}}
   if(best&&distance(a,best)>.3&&score>-24){this.setGoal(a,best,best.f!==a.f?(best.size==='new floor'?`Exploring L${best.f+1} via ${best.via}`:`Exploring L${best.f+1}`):`Exploring frontier (${best.size} cells)`);a.goal.frontier=true;return;}
  }
  let best=null,score=-Infinity;
  // Unknown frontiers are selected from the agent's own observed free cells.
  for(const [k,v]of a.memory){if(v.blocked)continue;const p=point(k);let unknown=0;for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(p.x+dx>0&&p.x+dx<W&&p.z+dz>0&&p.z+dz<D&&!a.memory.has(key(p.x+dx,p.z+dz,p.f)))unknown++;
   if(!floors.has(p.f))continue;const s=unknown*7-distance(a,p)-((a.visited?.get(k)??0)*6);if(unknown&&s>score){score=s;best=p;}}
  if(best){this.setGoal(a,best,'Exploring unknown space');return;}
  {const nf=newFloor();if(nf){this.setGoal(a,nf.best,`Exploring L${nf.best.f+1} via ${nf.best.via}`);return;}}
  const lands=[...a.landmarks.values()].filter(l=>a.type==='human'?l.id.startsWith('furniture-')||l.type==='hub'&&Math.sin(this.time*.37+a.x)>.6:l.type==='hub');if(lands.length){const l=lands[(Math.floor(this.time/17)+this.agents.indexOf(a))%lands.length];a.reuse++;this.setGoal(a,l,'Revisiting a known landmark');}else this.setGoal(a,{...this.home},'Returning to start');
 }
 chooseResidentGoal(a){
  // Staff periodically go to another floor (a meeting, the café): they must know a stair or lift
  // that reaches it, and they use their own memory of that link to plan the trip.
  if(a.type==='human'){a.nextFloorTrip??=60+(this.agents.indexOf(a)*37)%90;const links=this.knownLinks(a);if(this.time>=a.nextFloorTrip&&links.size){const floors=[...this.reachableFloors(a,links)].filter(f=>f!==a.f);if(floors.length){const f=floors[(this.agents.indexOf(a)+Math.floor(this.time/97))%floors.length],via=[...links].map(linkById).filter(l=>f>=l.floors[0]&&f<=l.floors[1]&&a.f>=l.floors[0]&&a.f<=l.floors[1]).sort((p,q)=>Math.hypot(p.landing.x-a.x,p.landing.z-a.z)-Math.hypot(q.landing.x-a.x,q.landing.z-a.z))[0]??linkById([...links][0]);
   a.nextFloorTrip=this.time+120+(this.agents.indexOf(a)*53)%120;const L=via;if(L&&f>=L.floors[0]&&f<=L.floors[1]){this.setGoal(a,{x:L.landing.x,z:L.landing.z,f},`Heading to L${f+1} for a meeting`);return;}}}}
  const lands=[...a.landmarks.values()].filter(l=>a.type==='human'?l.id.startsWith('furniture-')||l.type==='hub'&&Math.sin(this.time*.37+a.x)>.6:l.type==='hub');if(lands.length&&Math.sin(this.time+a.x)>.1){const l=lands[(Math.floor(this.time/13)+this.agents.indexOf(a)*3)%lands.length];a.reuse++;this.setGoal(a,l,a.type==='human'?`Heading to ${l.name.replace(/ sensor hub$/,'')}`:'Looking for a resting spot');}else this.explore(a);}
 servicePoint(o){return this.world.servicePoint(o);}
 chooseRobotGoal(){const a=this.robot;if(a.yieldRoute)return;
  if(this.battery<23&&!this.tasks.some(t=>t.type==='dock')){this.tasks.unshift({id:++this.counter,type:'dock',target:'dock',state:'Queued',progress:0});a.goal=null;a.path=[];}
  if(this.carry>=3&&!this.tasks.some(t=>t.type==='dispose')){
   if(a.landmarks.has('bin')){this.tasks.unshift({id:++this.counter,type:'dispose',target:'bin',state:'Queued',progress:0});a.goal=null;a.path=[];}
  }
  // Keep the task in progress; otherwise prefer urgent tasks, then same-floor and nearby targets.
  const ready=this.tasks.filter(t=>(t.retryAt??0)<=this.time&&(t.type!=='trash'||this.carry<3));
  const cost=t=>{if(t.type==='dock'||t.type==='dispose')return -1e3;if(t.manual)return -500;const o=this.world.object(t.target);if(!o)return 0;const p=this.servicePoint(o);return Math.hypot(p.x-a.x,p.z-a.z)+12*Math.abs(p.f-a.f);};
  const t=ready.find(t=>t.id===a.goal?.taskId)??ready.sort((p,q)=>cost(p)-cost(q))[0];
  if(t){const o=this.world.objects.find(o=>o.id===t.target);if(!o){this.tasks.splice(this.tasks.indexOf(t),1);return;}if(a.goal?.taskId!==t.id){if(a.landmarks.has(o.id)&&distance(a,o)>.2){a.reuse++;a.landmarks.get(o.id).visits++;}this.setGoal(a,this.servicePoint(a.objectMemory.get(o.id)??o),taskNames[t.type]);a.goal.taskId=t.id;t.state='On the way';}return;}
  if(!a.goal)this.explore(a);
 }
 perform(t,dt){const a=this.robot,o=this.world.objects.find(o=>o.id===t.target);t.state='In progress';a.status=taskNames[t.type];a.heading+=dt*1.5;
  if(t.type==='dock'){this.battery=Math.min(100,this.battery+dt*8);t.progress=this.battery/100;if(this.battery<99.9)return;}
  else {t.progress+=dt/2.5;if(t.progress<1)return;}
  const room=this.world.rooms.find(r=>r.id===o.room);
  if(t.type==='trash'){if(o.active){o.active=false;this.carry++;}a.objectMemory.set(o.id,{...o,time:this.time});}
  if(t.type==='surface'){o.active=false;a.objectMemory.set(o.id,{...o,time:this.time});}
  if(t.type==='tidy'){o.moved=false;o.baseline={x:o.x,z:o.z};a.objectMemory.set(o.id,{...o});this.log(a.name,'New position verified and baseline updated; heavy furniture stays in place');}
  if(t.type==='temperature'){room.lastSample={value:room.temp,time:this.time};this.log(a.name,`${room.name} temperature ${room.temp.toFixed(1)}°C${room.temp>26?'; warm-room alert':''}`);}
  if(t.type==='lights'){
   const occupants=this.agents.filter(b=>b!==a&&this.world.roomAt(b)?.id===room.id);
   // A discovered local hub supplies room occupancy at service time, not globally to navigation.
   if(occupants.length){t.state='Waiting for vacancy';t.retryAt=this.time+18;t.progress=0;a.goal=null;a.path=[];this.log(a.name,`${room.name} is occupied by a person or pet; keeping lights on and checking again in 18 s`);return;}room.light=false;
  }
  if(t.type==='dispose'){this.carry=0;this.log(a.name,'Waste delivered to the recycling station');}
  this.tasks.splice(this.tasks.indexOf(t),1);this.done.unshift({...t,finished:this.time,state:'Done'});this.log(a.name,`Completed: ${taskNames[t.type]} · ${o.name}`);a.goal=null;a.path=[];
 }
 motion(a){
  if(a.stair||a.dwell>0||a.scan>0||a.yieldPause>0||a.type==='human'&&a.waitingForRobot)return {x:0,z:0};
  const p=a.path[0];if(!p||p.f!==a.f)return {x:0,z:0};const d=Math.hypot(p.x-a.x,p.z-a.z);if(d<.001)return {x:0,z:0};const v=a.type==='robot'?.95:a.type==='human'?.7:.65;return {x:(p.x-a.x)/d*v,z:(p.z-a.z)/d*v};
 }
 humanRobotConflict(a){
  const b=this.robot;if(a.type!=='human'||a.stair||b.stair||a.f!==b.f||distance(a,b)>3||!this.world.visible(a,b))return false;
  const av=this.motion({...a,waitingForRobot:false}),bv=this.motion(b),rx=b.x-a.x,rz=b.z-a.z,vx=bv.x-av.x,vz=bv.z-av.z,v2=vx*vx+vz*vz;
  const closing=rx*vx+rz*vz<-.015,t=v2>.001?Math.max(0,Math.min(1.5,-(rx*vx+rz*vz)/v2)):0;
  return closing&&Math.hypot(rx+vx*t,rz+vz*t)<1.3;
 }
 waitForRobot(a){
  if(!a.waitingForRobot){a.waitingForRobot={x:a.x,z:a.z,f:a.f,since:this.time};a.yields++;this.log(a.name,'Waiting in place for MOMO to clear the way');}
  a.status='Waiting for MOMO to clear the way';
 }
 clearPedestrian(a){
  if(a.yieldRoute||this.time<(a.nextYieldAttempt??0))return;
  const h=this.agents.find(b=>b.type==='human'&&b.waitingForRobot&&!b.stair&&b.f===a.f&&distance(a,b)<2.5);if(!h)return;
  // Without a goal (e.g. every route is blocked by the people waiting for MOMO) it simply withdraws.
  if(!a.goal)a.goal={x:a.x+(a.x-h.x),z:a.z+(a.z-h.z),f:a.f,label:'Making room'};
  a.nextYieldAttempt=this.time+.7;const gx=a.goal.x-a.x,gz=a.goal.z-a.z,dx=Math.abs(gx)>=Math.abs(gz)?Math.sign(gx):0,dz=dx===0?Math.sign(gz):0;
  if((a.goal.x-a.x)*dx+(a.goal.z-a.z)*dz<.1)return;
  // Pass on a continuous shoulder of the corridor, beyond the coarser grid lanes. A repeated
  // attempt around the same waiting person means the pass is not working: withdraw instead.
  a.passTried??=new Map();const retry=this.time-(a.passTried.get(h.id)??-99)<12;
  if(!retry)for(const sign of [1,-1]){const nx=-dz,nz=dx,offset=(h.x-a.x)*nx+(h.z-a.z)*nz+sign*1.18;
   const path=[{x:a.x+nx*offset,z:a.z+nz*offset,f:a.f},{x:h.x+dx*1.5+nx*sign*1.18,z:h.z+dz*1.5+nz*sign*1.18,f:a.f},{x:h.x+dx*1.5,z:h.z+dz*1.5,f:a.f}];
   let from=a,safe=true;for(const p of path){if(!this.world.segmentClear(from,p,.24)){safe=false;break;}const n=Math.ceil(distance(from,p)*18);for(let i=1;i<=n&&safe;i++){const q={x:from.x+(p.x-from.x)*i/n,z:from.z+(p.z-from.z)*i/n,f:a.f};safe=this.agents.every(b=>b===a||b.stair||b.f!==a.f||distance(q,b)>(b.type==='human'?1.12:1.05));}if(!safe)break;from=p;}
   if(safe){a.path=path;a.nextThink=Infinity;a.yieldRoute=true;a.passTried.set(h.id,this.time);this.avoids++;a.yields++;this.log(a.name,`Moving around ${h.name}, who is waiting in place`);return;}
  }
  // If a doorway cannot be passed, withdraw into visible open space first.
  const waiting=this.agents.filter(b=>b.type==='human'&&b.waitingForRobot&&b.f===a.f),choices=[];
  for(const length of [2.1,1.3,.8])for(let i=0;i<16;i++){const angle=i*Math.PI/8,p={x:a.x+Math.cos(angle)*length,z:a.z+Math.sin(angle)*length,f:a.f};if(!a.memory.has(key(p.x,p.z,p.f))||!this.world.segmentClear(a,p,.24))continue;
   let safe=true;for(let j=1;j<=20&&safe;j++){const q={x:a.x+(p.x-a.x)*j/20,z:a.z+(p.z-a.z)*j/20,f:a.f};safe=this.agents.every(b=>b===a||b.stair||b.f!==a.f||distance(q,b)>1.06);}
   const clearance=Math.min(...waiting.map(b=>distance(p,b)));if(safe&&clearance>1.9)choices.push({p,score:clearance-length*.1});
  }
  choices.sort((x,y)=>y.score-x.score);if(choices.length){a.path=[choices[0].p];a.nextThink=Infinity;a.yieldRoute=true;a.retreatForHuman=true;this.avoids++;a.yields++;this.log(a.name,`Withdrawing to let ${h.name} continue`);}
 }
 stepAgent(a,dt){
  if(a.stair){const L=linkById(a.stair.link),lift=L.kind==='lift';a.stair.t=Math.min(1,a.stair.t+dt*(lift?1.6:1.25)/a.stair.len);a.renderPos=linkPosition(L,a.stair.from,a.stair.to,a.stair.t);a.status=lift?`Riding ${L.name} to L${a.stair.to+1}`:a.stair.to>a.stair.from?`Climbing the ${L.name.toLowerCase()} to L${a.stair.to+1}`:`Descending the ${L.name.toLowerCase()} to L${a.stair.to+1}`;
   if(a.stair.t===1){a.f=a.stair.to;a.x=L.landing.x;a.z=L.landing.z;a.distance+=a.stair.len;a.stair=null;a.renderPos=null;a.path.shift();a.scan=2;a.flights=(a.flights??0)+1;if(a===this.robot){a.localizer.reset({x:a.x,z:a.z,heading:a.heading,f:a.f});this.log(a.name,`Arrived at the ${L.name} on L${a.f+1}: pose re-anchored to the surveyed landing`);}}return;}
  // Pedestrians retain their route and exact position. Only MOMO clears this conflict.
  if(a.type==='human'){
   const b=this.robot,patient=this.time>=(a.ignoreRobotUntil??0),conflict=patient&&this.humanRobotConflict(a);
   // Deadlock breaker: after 12 s of waiting a person stops deferring and walks around MOMO instead.
   if(a.waitingForRobot&&this.time-a.waitingForRobot.since>12){a.waitingForRobot=null;a.ignoreRobotUntil=this.time+10;a.path=[];a.nextThink=0;a.status='Walking around MOMO';this.log(a.name,'Has waited long enough; walking around MOMO');}
   else if(a.waitingForRobot){if(!b.stair&&b.f===a.f&&(distance(a,b)<1.85||conflict)){this.waitForRobot(a);return;}a.waitingForRobot=null;a.status='Way clear / resuming route';}
   if(conflict){this.waitForRobot(a);return;}
  }
  if(a===this.robot&&a.yieldPause>0){a.yieldPause=Math.max(0,a.yieldPause-dt);a.status='Holding clear for pedestrians';return;}
  if(a.dwell>0){a.dwell-=dt;a.heading+=dt*.55;a.status=a.type==='human'?'Staying in the room / looking around':'Resting / looking around';return;}
  if(a===this.robot){if(a.yieldRoute){a.yieldSince??=this.time;if(this.time-a.yieldSince>8){a.yieldRoute=false;a.retreatForHuman=false;a.path=[];a.nextThink=0;}}else a.yieldSince=null;this.chooseRobotGoal();this.clearPedestrian(a);if(a.goal?.taskId&&distance(a,a.goal)<.12&&!a.yieldRoute){const t=this.tasks.find(t=>t.id===a.goal.taskId);if(t){this.perform(t,dt);return;}}}
  else if(!a.goal)this.chooseResidentGoal(a);
  if(a.scan>0){a.scan-=dt;a.heading+=dt*2;a.status='Turning / scanning surroundings';return;}
  if(!a.goal){a.heading+=dt;a.status='Scanning / on standby';return;}
  if(distance(a,a.goal)<.12&&!a.yieldRoute){if(a.trip){const t=a.trip,actual=this.time-t.t0,base=a.type==='human'?.7:.85,g=geodesic(this.world,t.from,t.to,base);if(g&&actual>.5)this.trips.push({agent:a.id,type:a.type,actual:+actual.toFixed(1),ideal:g.time,efficiency:Math.min(1,g.time/actual),metres:g.metres,floors:g.floors});a.trip=null;}
   a.visited??=new Map();const k=key(a.x,a.z,a.f);a.visited.set(k,(a.visited.get(k)??0)+1);a.goal=null;a.path=[];a.scan=3.2;if(a!==this.robot)a.dwell=a.type==='human'?3:2;return;}
  if(!a.path.length||this.time>=a.nextThink)this.plan(a);if(!a.path.length){a.heading+=dt;return;}
  const next=a.path[0];
  if(next.f!==a.f){const L=LINK_AT.get(key(a.x,a.z,a.f));if(!L){a.path=[];a.nextThink=0;return;}if(Math.hypot(a.x-L.landing.x,a.z-L.landing.z)>.05){a.path.unshift({x:L.landing.x,z:L.landing.z,f:a.f});return;}
   // One user per stair flight; a lift car carries one rider per trip.
   const lo=Math.min(a.f,next.f),busy=this.agents.some(b=>b!==a&&b.stair&&b.stair.link===L.id&&(L.kind==='lift'||Math.min(b.stair.from,b.stair.to)===lo||b.stair.to===next.f)),occupied=this.agents.some(b=>b!==a&&!b.stair&&b.f===next.f&&distance(b,next)<1.2);
   if(busy||occupied){a.status=L.kind==='lift'?`Waiting for ${L.name}`:`Waiting for a clear ${L.name.toLowerCase()}`;return;}a.stair={t:0,from:a.f,to:next.f,link:L.id,len:linkLength(L,a.f,next.f)};a.goal??=next;return;}
  const dx=next.x-a.x,dz=next.z-a.z,len=Math.hypot(dx,dz);if(len<.001){a.path.shift();return;}a.heading=Math.atan2(dz,dx);
  // A forward look is still inside the finite view cone. Navigation never reads hidden walls.
  if(!this.world.segmentClear(a,next,.16)){const k=key(next.x,next.z,next.f);a.bumps??=new Map();a.bumps.set(k,this.time);if(a===this.robot){a.yieldRoute=false;a.retreatForHuman=false;this.log(a.name,'Near-field bumper: unseen obstacle ahead, replanning');}a.path=[];a.nextThink=0;a.scan=.8;a.status='Obstacle detected / replanning';return;}
  const area=this.world.areaAt(a.x,a.z,a.f),base=(a.type==='robot'?.95:a.type==='human'?.7:a.type==='dog'?.85:.65)*(area?.speed??1);
  if(area){if(area.type==='hindrance')a.hinderTime=(a.hinderTime??0)+dt;else a.affordTime=(a.affordTime??0)+dt;
   if(area.reveal&&a.readSign!==`${a.f}`){a.readSign=`${a.f}`;let n=0;for(const o of this.world.objects)if(o.link&&o.f===a.f&&!a.landmarks.has(o.id)){this.rememberLandmark(a,o);n++;}if(n&&a===this.robot)this.log(a.name,`Read the L${a.f+1} building directory: ${n} stairs / lifts added to memory`);}}
  let speed=base;
  for(const b of this.agents){if(b===a||b.stair||b.f!==a.f)continue;const d=distance(a,b);if(d<2&&a.seen.has(b.id))speed=Math.min(speed,base*.5);}
  const step=Math.min(len,dt*speed),candidate={x:a.x+dx/len*step,z:a.z+dz/len*step,f:a.f};
  // Swept near-field safety bumper is distinct from the limited visual mapping sensor.
  if(this.agents.some(b=>{if(b===a||!b.stair||(b.stair.to!==a.f&&b.stair.from!==a.f))return false;const L=linkById(b.stair.link);return Math.hypot(candidate.x-L.landing.x,candidate.z-L.landing.z)<1.2;})){a.status='Waiting for a reserved landing';return;}
  const other=this.agents.find(b=>b!==a&&!b.stair&&b.f===a.f&&distance(candidate,b)<(a.type==='robot'||b.type==='robot'?1.05:.72));
  if(other){if(a.type==='human'&&other===this.robot){this.waitForRobot(a);return;}if(!a.wasYielding){a.yields++;if(a===this.robot)this.avoids++;}a.wasYielding=true;a.status=`Giving way to ${other.name}`;a.wait=(a.wait??0)+dt;
   if(a.wait>1.8){const forbidden=new Set(this.agents.filter(b=>b!==a&&b.f===a.f&&distance(a,b)<3).flatMap(b=>{const out=[];for(let x=Math.floor(b.x)-1;x<=Math.ceil(b.x)+1;x++)for(let z=Math.floor(b.z)-1;z<=Math.ceil(b.z)+1;z++)if(Math.hypot(x-b.x,z-b.z)<1.25)out.push(key(x,z,b.f));return out;}));const known=this.knownLinks(a),detour=route(a,a.goal,k=>a.memory.get(k)?.blocked===true||forbidden.has(k),known.size?known:false);if(detour?.length){a.path=detour;a.nextThink=this.time+4;}
    else {const choices=[],away=Math.atan2(a.z-other.z,a.x-other.x);for(const length of [1.3,.8,.4])for(const angle of [0,.45,-.45,.9,-.9,1.4,-1.4]){const theta=away+angle,p={x:a.x+Math.cos(theta)*length,z:a.z+Math.sin(theta)*length,f:a.f};if(!this.world.segmentClear(a,p,.24))continue;let safe=true;for(let i=1;i<=12&&safe;i++){const q={x:a.x+(p.x-a.x)*i/12,z:a.z+(p.z-a.z)*i/12,f:a.f};safe=this.agents.every(b=>b===a||b.stair||b.f!==a.f||distance(q,b)>(a.type==='robot'||b.type==='robot'?1.05:.72));}if(safe)choices.push({p,score:distance(p,other)-Math.abs(angle)*.2});}choices.sort((x,y)=>y.score-x.score);if(choices[0]){a.path=[choices[0].p];a.nextThink=this.time+5;a.retreatForHuman=a===this.robot&&other.type==='human';a.status='Moving aside / clearing the way';}}
    a.wait=0;}
   return;
  }
  a.wait=0;a.wasYielding=false;a.x=candidate.x;a.z=candidate.z;a.distance+=step;a.status=a.yieldRoute?'Moving around waiting pedestrian':a.goal.label??'Moving';if(len<=step+.001){a.path.shift();if(!a.path.length&&a.yieldRoute){a.yieldRoute=false;a.nextThink=0;}if(!a.path.length&&a.retreatForHuman){a.yieldPause=2;a.retreatForHuman=false;}}
  if(a===this.robot){const e=(dt*.009+step*.015)*Math.max(0,area?.energy??1);this.energyUsed+=e;this.battery=Math.max(0,Math.min(100,this.battery-e+(area?.energy<0?dt*.5*-area.energy:0)));}
 }
 get clock(){return new Date(this.clockStart.getTime()+this.time*1000*this.timeScale);}
 setClock(date,timeScale=this.timeScale){this.clockStart=new Date(date.getTime()-this.time*1000*timeScale);this.timeScale=timeScale;this.updateEnvironment(true);}
 setWeather(series){this.weather=series;this.updateEnvironment(true);}
 // Real sun + weather at the site clock -> room temperatures and glare regions (every 10 site-minutes).
 updateEnvironment(force=false){const c=this.clock,bucket=Math.floor(c.getTime()/600000);if(!force&&bucket===this.envClock)return;this.envClock=bucket;
  const cond=conditionsAt(c,this.weather),fx=solarEffects(this.world,cond);this.conditions=cond;for(const r of this.world.rooms)r.temp=fx.temps.get(r.id)??r.temp;
  for(const a of [...this.world.areas])if(a.kind==='glare')this.world.removeArea(a.id);for(const g of fx.glare)this.world.addArea(g);this.glareCount=fx.glare.length;}
 // Stochastic (seeded) events: new litter appears, and corridor spills create temporary wet floors.
 stochastic(){const r=this.rng;
  if(this.time>=this.nextLitter){this.nextLitter=this.time+25+r.u()*55;const rooms=this.world.rooms.filter(x=>x.kind==='room'),room=r.pick(rooms),cells=this.world.reachableCells(room);if(cells.length){const c=r.pick(cells),o={id:`litter-${++this.counter}`,name:`${room.name} litter`,type:'trash',category:'litter',x:c.x,z:c.z,y:0,rot:0,size:{w:.3,d:.25,h:.12},w:.3,d:.25,h:.12,f:room.f,room:room.id,solid:false,active:true,mobility:'movable',affordances:['pick-up','dispose'],parts:[],interactive:false,access:{x:c.x,z:c.z}};this.world.addObject(o);this.log('Environment',`New litter appeared in ${room.name} (L${room.f+1})`);}}
  if(this.time>=this.nextSpill){this.nextSpill=this.time+80+r.u()*120;const f=r.int(FLOORS),s=r.pick(zoneSites(f).filter(z=>z.x1-z.x0<=4)),a=this.world.addArea({id:`spill-${++this.counter}`,kind:'wet-floor',...s,f,until:this.time+150,dynamic:true});this.log('Environment',`A spill made the floor wet on L${f+1} (x ${a.x0.toFixed(0)}–${a.x1.toFixed(0)}) for 150 s`);}
  for(const a of [...this.world.areas])if(a.until&&a.until<=this.time)this.world.removeArea(a.id);}
 update(dt){if(!this.running)return;let remaining=Math.min(dt,.15)*this.speed;while(remaining>1e-6){const s=Math.min(.06,remaining);remaining-=s;this.time+=s;if(this.opts.events!==false)this.stochastic();this.updateEnvironment();for(const a of this.agents)this.stepAgent(a,s);if(this.time-this.lastSense>.2){this.lastSense=this.time;for(const a of this.agents){this.sense(a);a.trail.push({x:a.x,z:a.z,f:a.f});if(a.trail.length>1800)a.trail.shift();}this.coverage=[...this.robot.memory.values()].filter(v=>!v.blocked).length/this.walkableCount;}}
 }
 // Measurable performance for each goal type, plus one aggregate environment score (0–100).
 performance(){const mins=Math.max(1/60,this.time/60),r=this.robot,lat=this.done.filter(t=>t.created!==undefined).map(t=>t.finished-t.created);
  const robot={goal:'Discover and complete facility tasks',tasksDone:this.done.length,tasksPerMin:+(this.done.length/mins).toFixed(2),meanTaskLatency:lat.length?+(lat.reduce((a,b)=>a+b,0)/lat.length).toFixed(1):null,coverage:+this.coverage.toFixed(3),energyPerTask:+(this.energyUsed/Math.max(1,this.done.length)).toFixed(2),hindranceSec:+(r.hinderTime??0).toFixed(1),affordanceSec:+(r.affordTime??0).toFixed(1),distance:+r.distance.toFixed(1),floorsVisited:new Set(r.trail.map(p=>p.f)).size};
  const staffTrips=this.trips.filter(t=>t.type==='human'),dogTrips=this.trips.filter(t=>t.type==='dog'),mean=a=>a.length?a.reduce((x,t)=>x+t.efficiency,0)/a.length:0,people=this.agents.filter(a=>a.type==='human');
  const staff={goal:'Reach a destination quickly (trip time vs. ideal)',trips:staffTrips.length,meanEfficiency:+mean(staffTrips).toFixed(3),failedTrips:this.failedTrips,yieldsPerMin:+(people.reduce((s,a)=>s+a.yields,0)/mins).toFixed(2),hindranceSec:+people.reduce((s,a)=>s+(a.hinderTime??0),0).toFixed(1),floorsTravelled:staffTrips.reduce((s,t)=>s+t.floors,0)};
  const dog={goal:'Find a resting spot',trips:dogTrips.length,meanEfficiency:+mean(dogTrips).toFixed(3)};
  const parts={throughput:Math.min(1,robot.tasksPerMin/4),exploration:Math.min(1,this.coverage/(.0006*this.time+.02)),staffFlow:staffTrips.length?robot&&mean(staffTrips)*(1-Math.min(.5,this.failedTrips/(staffTrips.length+this.failedTrips+1))):0,energy:1-Math.min(1,robot.energyPerTask/6),calm:1-Math.min(1,(staff.yieldsPerMin+this.avoids/mins)/15)};
  const score=100*(.3*parts.throughput+.15*parts.exploration+.35*parts.staffFlow+.1*parts.energy+.1*parts.calm);
  return {time:+this.time.toFixed(0),settled:this.time>=60,robot,staff,dog,parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,+v.toFixed(3)])),score:+score.toFixed(1)};}
 get walkableCount(){if(!this._count){this._count=0;for(let f=0;f<FLOORS;f++)for(let x=1;x<W;x++)for(let z=1;z<D;z++)if(!this.world.navBlocked(x,z,f))this._count++;}return this._count;}
 inject(type){const a=this.robot,w=this.world;
  if(type==='move'){
   // Move a movable piece the robot already knows (chairs first), never onto people, walls or doorways.
   const known=w.objects.filter(o=>o.solid&&a.objectMemory.has(o.id)&&o.mobility!=='fixed').sort((p,q)=>(q.movable-p.movable)||(q.type==='chair')-(p.type==='chair'));
   for(const o of known){for(const [dx,dz]of [[.6,0],[-.6,0],[0,.6],[0,-.6],[.9,0],[-.9,0],[0,.9],[0,-.9]]){const ox=o.x,oz=o.z;o.x+=dx;o.z+=dz;w.sync();
     const room=w.rooms.find(r=>r.id===o.room),bb=o.aabb,inRoom=bb.x0>=room.bounds.x0&&bb.x1<=room.bounds.x1&&bb.z0>=room.bounds.z0&&bb.z1<=room.bounds.z1;
     const clash=w.colliders.some(c=>c.f===o.f&&c.nav&&c.owner!==o.id&&c.x0<bb.x1&&bb.x0<c.x1&&c.z0<bb.z1&&bb.z0<c.z1);
     const nearAgent=this.agents.some(b=>b.f===o.f&&b.x>bb.x0-1&&b.x<bb.x1+1&&b.z>bb.z0-1&&b.z<bb.z1+1);
     const access=w.objects.filter(x=>x.f===o.f&&(x.access||x.type==='door')).flatMap(x=>Array.isArray(x.access)?x.access:x.access?[x.access]:[]).some(p=>w.navBlocked(p.x,p.z,o.f));
     if(inRoom&&!clash&&!nearAgent&&!access){if(o.baseline)o.moved=true;this.log('Scene',`${o.name} was moved ${Math.hypot(dx,dz).toFixed(1)} m; waiting for MOMO to observe it again`);return o;}
     o.x=ox;o.z=oz;w.sync();}}
   this.log('Scene','Let MOMO discover movable furniture before moving it');return null;}
  if(type==='close-door'){const d=w.doors.filter(d=>!d.exterior&&d.open&&!this.agents.some(b=>b.f===d.f&&Math.hypot(b.x-d.x,b.z-d.z)<1.8)).sort((p,q)=>(a.objectMemory.has(q.id)-a.objectMemory.has(p.id))||distance(a,p)-distance(a,q))[0];if(!d){this.log('Scene','No door can be closed safely right now');return null;}w.setDoor(d.id,false);this.log('Scene',`${d.name} was closed; MOMO must observe it to update its map`);return d;}
  if(type==='open-doors'){for(const d of w.doors)if(!d.exterior&&!d.open)w.setDoor(d.id,true);this.log('Scene','All interior doors opened');return null;}
  if(type==='trash'){const o={id:`spill-${++this.counter}`,name:'New litter',type:'trash',category:'litter',x:Math.max(1,Math.min(W-1,Math.round(a.x))),z:Math.max(1,Math.min(D-1,Math.round(a.z+2))),y:0,rot:0,size:{w:.3,d:.25,h:.12},w:.3,d:.25,h:.12,f:a.f,solid:false,active:true,mobility:'movable',affordances:['pick-up','dispose'],parts:[],interactive:false};if(w.navBlocked(o.x,o.z,o.f))o.z=Math.round(a.z);o.access={x:o.x,z:o.z};o.room=w.roomContaining(o)?.id??w.roomAt(o)?.id;w.addObject(o);this.log('Scene','New litter added; MOMO must see it to discover it');return o;}
  if(type==='spill'){const site=zoneSites(a.f).filter(z=>z.x1-z.x0<=4).sort((p,q)=>Math.hypot((p.x0+p.x1)/2-a.x,(p.z0+p.z1)/2-a.z)-Math.hypot((q.x0+q.x1)/2-a.x,(q.z0+q.z1)/2-a.z))[1];if(site){w.addArea({id:`spill-${++this.counter}`,kind:'wet-floor',...site,f:a.f,until:this.time+150,dynamic:true});this.log('Scene',`Wet-floor spill on L${a.f+1} near MOMO (a hindrance for 150 s)`);}return null;}
  if(type==='lights'){for(const r of w.rooms)r.light=true;this.log('Scene','All room lights are on; waiting for inspection');}
 }
 addAgents(){const start=this.agents.length;for(let i=0;i<6;i++){const f=i%FLOORS;let p;for(let x=3;x<W-3&&!p;x+=2)for(const z of [10,20])if(!p&&!LINK_AT.has(key(x,z,f))&&!this.world.navBlocked(x,z,f)&&!this.agents.some(a=>a.f===f&&Math.hypot(a.x-x,a.z-z)<2.5))p={x,z,f};if(!p)continue;const n=this.agents.length;this.agents.push({id:`agent-${n}`,name:`Visitor ${n-start+1}`,type:'human',...p,heading:0,color:colors[n%colors.length],range:5,fov:115*Math.PI/180,memory:new Map(),landmarks:new Map(),seen:new Map(),objectMemory:new Map(),path:[],trail:[],distance:0,status:'Exploring a new environment',goal:null,dwell:0,scan:0,nextThink:0,stair:null,reuse:0,yields:0,eye:EYE.human});}this.log('Experiment','Added 6 visitors with empty maps to compare shared knowledge');}
}
