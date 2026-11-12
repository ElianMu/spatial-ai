import {W,D,H,EYE,key,point,distance,createWorld,route,stairPosition,STAIR_LENGTH} from './world.mjs?v=20261112b';
import {OccupancyMap,Localizer,robotPerceive,RES} from './mapping.mjs?v=20261112b';
import {SemanticBelief,detectObjects,groundTruthGraph,ROOM_LABELS} from './semantics.mjs?v=20261112b';
export const taskNames={trash:'Collect litter',surface:'Clean floor spills',tidy:'Review furniture',temperature:'Check temperature',lights:'Switch off empty rooms',patrol:'Patrol the house',dock:'Return to dock',dispose:'Empty waste bin'};
const colors=['#39c9b0','#f0aa71','#b7a5e1','#e9cb70','#b9b3aa','#efb48f','#9db79c'];
export class Simulation{
 constructor(){this.reset();}
 reset(){this.world=createWorld();this._count=null;this.time=0;this.running=false;this.speed=1;this.auto=true;this.tasks=[];this.done=[];this.events=[];this.counter=0;this.coverage=0;this.avoids=0;this.scans=0;this.collisions=0;this.carry=0;this.battery=100;this.lastSense=0;
  this.agents=[];
  const specs=[['MOMO','robot',2,9,0],['Alex','human',4,6,0],['Priya','human',12,6,0],['Sam','human',12,12,1],['Jordan','human',20,12,0],['Lee','human',4,12,1],['Biscuit','dog',20,6,0]];
  specs.forEach(([name,type,x,z,f],i)=>this.agents.push({id:`agent-${i}`,name,type,x,z,f,heading:0,color:colors[i],range:type==='robot'?6.5:type==='human'?5:4,fov:(type==='robot'?105:type==='human'?115:130)*Math.PI/180,memory:new Map(),landmarks:new Map(),seen:new Map(),objectMemory:new Map(),path:[],trail:[],distance:0,status:'Ready to start',goal:null,dwell:0,scan:0,nextThink:0,stair:null,reuse:0,yields:0}));
  this.robot=this.agents[0];Object.assign(this.robot,{map:new OccupancyMap(),localizer:new Localizer({x:2,z:9,heading:0,f:0}),belief:new SemanticBelief(),bumps:new Map(),lastScan:null,doorState:new Map(),roomLabels:new Map()});this.graph={nodes:[],edges:[]};this.graphTime=-1;this.perf={senseMs:0,graphMs:0,senses:0};
  for(const a of this.agents)a.eye=EYE[a.type];
  this.rememberLandmark(this.robot,this.world.objects.find(o=>o.id==='dock'));this.log('System','Press Start: perceive → map → discover tasks → act');
 }
 log(who,msg){this.events.unshift({time:this.time,who,msg});this.events=this.events.slice(0,70);}
 rememberLandmark(a,o){if(!a.landmarks.has(o.id)){const p=this.world.servicePoint(o);a.landmarks.set(o.id,{id:o.id,name:o.name,type:o.type,x:p.x,z:p.z,f:o.f,ox:o.x,oz:o.z,relative:[p.x-1,p.z-9,o.f*H],visits:1});if(a===this.robot)this.log(a.name,`Landmark saved: ${o.name} (relative to dock)`);}}
 canSee(a,p,toY=null){if(a.stair||a.f!==p.f||distance(a,p)>a.range)return false;if(distance(a,p)<.6)return true;const angle=Math.atan2(p.z-a.z,p.x-a.x),delta=Math.atan2(Math.sin(angle-a.heading),Math.cos(angle-a.heading));return Math.abs(delta)<a.fov/2&&this.world.visible(a,p,null,toY);}
 sense(a){
  if(a===this.robot&&!a.stair){this.robotSense(a);return;}
  // People and pets keep the original idealised perception: a visible cell reveals its true state.
  for(let x=Math.max(0,Math.floor(a.x-a.range));x<=Math.min(W,Math.ceil(a.x+a.range));x++)for(let z=Math.max(0,Math.floor(a.z-a.range));z<=Math.min(D,Math.ceil(a.z+a.range));z++){
   const p={x,z,f:a.f};if(this.canSee(a,p,this.world.surfaceHeight(x,z,a.f)+.01))a.memory.set(key(x,z,a.f),{blocked:this.world.navBlocked(x,z,a.f),occupied:this.world.blocked(x,z,a.f),time:this.time});
  }
  for(const b of this.agents)if(b!==a&&this.canSee(a,b))a.seen.set(b.id,{x:b.x,z:b.z,f:b.f,time:this.time,name:b.name,type:b.type});
  for(const o of this.world.objects)if(o.active!==false&&o.f===a.f&&(['hub','dock','bin','stairs'].includes(o.type)||a.type==='human'&&o.id.startsWith('furniture-'))&&this.canSee(a,{x:o.x,z:o.z,f:o.f,owner:o.id},(o.y??0)+Math.min(o.h,1)/2)){a.objectMemory.set(o.id,{...o,time:this.time});this.rememberLandmark(a,o);}
 }
 // Robot: simulated LiDAR + RGB-D -> pose estimate -> occupancy map -> detections -> belief.
 robotSense(a){
  const t0=globalThis.performance?.now?.()??0;this.world.sync();
  a.lastScan=robotPerceive(this.world,a,a.map,a.localizer,this.time);
  const est=a.lastScan.pose,dth=est.heading-a.heading,c=Math.cos(dth),s=Math.sin(dth);
  const delta=(x,z)=>{const rx=x-a.x,rz=z-a.z,px=est.x+rx*c-rz*s,pz=est.z+rx*s+rz*c;return {x:px,z:pz,dx:px-x,dz:pz-z};};
  a.belief.recordCovisibility(a,a.lastScan.depth.floorPts);
  const det=detectObjects(this.world,a,a.fov);a.belief.integrate(this.world,a,det,this.time,delta);a.lastDetections=det.detections.filter(d=>!d.occluded).map(d=>d.o.id);
  for(const b of this.agents)if(b!==a&&this.canSee(a,b))a.seen.set(b.id,{x:b.x,z:b.z,f:b.f,time:this.time,name:b.name,type:b.type});
  for(const d of det.detections){if(d.occluded)continue;const o=d.o,old=a.objectMemory.get(o.id);a.objectMemory.set(o.id,{...o,time:this.time});
   if(['hub','dock','bin','stairs'].includes(o.type))this.rememberLandmark(a,o);
   if(['trash','surface'].includes(o.type)&&this.auto)this.enqueue(o.type,o.id,false);
   if(o.type==='door'){const k=key(o.x,o.z,o.f),m=a.memory.get(k);if(m)m.door=o.id;const prev=a.doorState.get(o.id),now=o.open?'open':'closed';if(prev&&prev!==now)this.log(a.name,now==='closed'?`${o.name} closed: marked as a temporarily blocked doorway, not a wall`:`${o.name} open again: doorway traversable`);a.doorState.set(o.id,now);if(now==='open'&&prev==='closed'){for(const t of this.tasks)if(t.state==='Waiting for access')t.retryAt=this.time;}}
   if(o.solid&&old&&(Math.abs(old.x-o.x)>.05||Math.abs(old.z-o.z)>.05)){this.log(a.name,`Position changed: ${o.name}; updating obstacle memory`);if(o.baseline){o.moved=true;this.rememberLandmark(a,{...o,name:`${o.name} position change`});if(this.auto)this.enqueue('tidy',o.id,false);}}
   if(o.type==='hub'){const r=this.world.rooms.find(r=>r.id===o.room);if(this.auto&&r.lastSample===null)this.enqueue('temperature',o.id,false);if(this.auto&&r.light)this.enqueue('lights',o.id,false);}
  }
  this.scans++;this.perf.senseMs+=(globalThis.performance?.now?.()??0)-t0;this.perf.senses++;
  if(this.time-this.graphTime>=1)this.refreshGraph();
 }
 refreshGraph(){const a=this.robot,t0=globalThis.performance?.now?.()??0;this.graph=a.belief.graph(a,this.time);this.graphTime=this.time;
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
 setGoal(a,p,label){a.goal={...p,label};a.path=[];a.nextThink=0;}
 plan(a){if(!a.goal)return;const target=a.goal,knownStairs=[...a.landmarks.values()].some(l=>l.type==='stairs');
  const nearby=a===this.robot?this.agents.filter(b=>b.type==='human'&&!b.stair&&b.f===a.f&&distance(a,b)<3.5):this.time<(a.ignoreRobotUntil??0)&&!this.robot.stair&&this.robot.f===a.f?[this.robot]:[];
  const robot=a===this.robot,bumps=a.bumps??new Map();
  const sk=key(a.x,a.z,a.f),edge=robot?(c,n)=>{const p=c===sk?{x:a.x,z:a.z,f:a.f}:point(c),q=point(n);return p.f===q.f&&a.map.edgeBlocked(p,q,p.f,c===sk?.16:.22,c===sk);}:(c,n)=>c===sk?!this.world.segmentClear({x:a.x,z:a.z,f:a.f},point(n),.16):a.memory.has(c)&&a.memory.has(n)&&!this.world.edgeClear(c,n);
  const path=route(a,target,k=>a.memory.get(k)?.blocked===true||this.time-(bumps.get(k)??-99)<20||nearby.some(b=>distance(point(k),b)<1.3),knownStairs,edge);a.path=path??[];if(path?.length===0&&distance(a,target)>.01)a.path=[{x:target.x,z:target.z,f:target.f}];a.nextThink=this.time+2;
  if(path===null&&robot){a.failCount=(a.failCount??0)+1;
   // Recovery: after repeated planning failures in the same spot, back out along the robot's own
   // recent trajectory (space it has physically occupied) before trying again.
   if(a.failCount>=4&&a.trail.length>8){const back=[];let acc=0,prev={x:a.x,z:a.z};for(let i=a.trail.length-1;i>=0&&acc<2.2;i--){const p=a.trail[i];if(p.f!==a.f)break;const d=Math.hypot(p.x-prev.x,p.z-prev.z);if(d>.35){acc+=d;back.push({x:p.x,z:p.z,f:p.f});prev=p;}}
    if(back.length&&back.every((p,i)=>this.world.segmentClear(i?back[i-1]:a,p,.1))){a.failCount=0;a.path=back;a.yieldRoute=true;a.nextThink=Infinity;a.goal={...back.at(-1),label:'Recovery: backing out'};this.log(a.name,'Recovery: backing out along its own trajectory');return;}}}
  else if(robot)a.failCount=0;
  if(path===null){a.yieldRoute=false;a.retreatForHuman=false;a.visited??=new Map();const k=key(target.x,target.z,target.f);a.visited.set(k,(a.visited.get(k)??0)+5);if(target.taskId){const t=this.tasks.find(t=>t.id===target.taskId);if(t){t.fails=(t.fails??0)+1;t.retryAt=this.time+Math.min(120,12*2**Math.min(4,t.fails-1));t.state='Waiting for access';}}a.goal=null;a.status='Target blocked; exploring another area';}}
 explore(a){
  const knownStairs=[...a.landmarks.values()].some(l=>l.type==='stairs');
  if(a===this.robot&&a.map){
   // Frontier-based exploration on the robot's own 0.25 m occupancy grid.
   let best=null,score=-Infinity;const floors=knownStairs?[a.f,1-a.f]:[a.f];
   for(const f of floors){
    // An unvisited floor reached by known stairs is itself one large frontier.
    if(f!==a.f&&![...a.memory.keys()].some(k=>k.endsWith(`,${f}`))){const s=10-distance(a,{x:23,z:9,f:a.f});if(s>score){score=s;best={x:23,z:9,f,size:'new floor'};}continue;}
    for(const fr of a.map.frontiers(f)){let target=null,td=Infinity;
     for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){const x=Math.round(fr.x)+dx,z=Math.round(fr.z)+dz,k=key(x,z,f),m=a.memory.get(k);if(!m||m.blocked||this.time-(a.bumps.get(k)??-99)<20)continue;const d=Math.hypot(x-fr.x,z-fr.z);if(d<td){td=d;target={x,z,f};}}
     if(!target)continue;const k=key(target.x,target.z,f),s=Math.min(fr.size,40)*.45-distance(a,target)-(f!==a.f?12:0)-((a.visited?.get(k)??0)*5)-td;if(s>score){score=s;best={...target,size:fr.size};}}}
   if(best&&distance(a,best)>.3&&score>-14){this.setGoal(a,best,best.f!==a.f?'Exploring the other floor':`Exploring frontier (${best.size} cells)`);a.goal.frontier=true;return;}
  }
  let best=null,score=-Infinity;
  // Unknown frontiers are selected from the agent's own observed free cells.
  for(const [k,v]of a.memory){if(v.blocked)continue;const p=point(k);let unknown=0;for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(p.x+dx>0&&p.x+dx<W&&p.z+dz>0&&p.z+dz<D&&!a.memory.has(key(p.x+dx,p.z+dz,p.f)))unknown++;
   if(p.f!==a.f&&!knownStairs)continue;const s=unknown*7-distance(a,p)-((a.visited?.get(k)??0)*6);if(unknown&&s>score){score=s;best=p;}}
  if(best){this.setGoal(a,best,'Exploring unknown space');return;}
  const stairs=[...a.landmarks.values()].find(l=>l.type==='stairs'&&l.f===a.f);if(stairs&&!a.memory.has(key(22,9,1-a.f))){this.setGoal(a,{x:23,z:9,f:1-a.f},'Exploring the other floor');return;}
  const lands=[...a.landmarks.values()].filter(l=>a.type==='human'?l.id.startsWith('furniture-')||l.type==='hub'&&Math.sin(this.time*.37+a.x)>.6:l.type==='hub');if(lands.length){const l=lands[(Math.floor(this.time/17)+this.agents.indexOf(a))%lands.length];a.reuse++;this.setGoal(a,l,'Revisiting a known landmark');}else this.setGoal(a,{x:2,z:9,f:0},'Returning to start');
 }
 chooseResidentGoal(a){const lands=[...a.landmarks.values()].filter(l=>a.type==='human'?l.id.startsWith('furniture-')||l.type==='hub'&&Math.sin(this.time*.37+a.x)>.6:l.type==='hub');if(lands.length&&Math.sin(this.time+a.x)>.1){const l=lands[(Math.floor(this.time/13)+this.agents.indexOf(a)*3)%lands.length];a.reuse++;this.setGoal(a,l,a.type==='human'?`Heading to ${l.name.replace(/ sensor hub$/,'')}`:'Looking for a resting spot');}else this.explore(a);}
 servicePoint(o){return this.world.servicePoint(o);}
 chooseRobotGoal(){const a=this.robot;if(a.yieldRoute)return;
  if(this.battery<23&&!this.tasks.some(t=>t.type==='dock')){this.tasks.unshift({id:++this.counter,type:'dock',target:'dock',state:'Queued',progress:0});a.goal=null;a.path=[];}
  if(this.carry>=3&&!this.tasks.some(t=>t.type==='dispose')){
   if(a.landmarks.has('bin')){this.tasks.unshift({id:++this.counter,type:'dispose',target:'bin',state:'Queued',progress:0});a.goal=null;a.path=[];}
  }
  // Keep the task in progress; otherwise prefer urgent tasks, then same-floor and nearby targets.
  const ready=this.tasks.filter(t=>(t.retryAt??0)<=this.time&&(t.type!=='trash'||this.carry<3));
  const cost=t=>{if(t.type==='dock'||t.type==='dispose')return -1e3;if(t.manual)return -500;const o=this.world.object(t.target);if(!o)return 0;const p=this.servicePoint(o);return Math.hypot(p.x-a.x,p.z-a.z)+(p.f!==a.f?25:0);};
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
  if(a.stair){a.stair.t=Math.min(1,a.stair.t+dt*1.25/STAIR_LENGTH);const pos=stairPosition(a.stair.t,a.stair.from);a.renderPos=pos;a.status=a.stair.from===0?'Going upstairs':'Going downstairs';if(a.stair.t===1){a.f=1-a.stair.from;a.x=23;a.z=9;a.stair=null;a.renderPos=null;a.path.shift();a.distance+=STAIR_LENGTH;a.scan=2;if(a===this.robot){a.localizer.reset({x:a.x,z:a.z,heading:a.heading,f:a.f});this.log(a.name,'Arrived at stair landing: pose re-anchored to the surveyed landing');}}return;}
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
  if(distance(a,a.goal)<.12&&!a.yieldRoute){a.visited??=new Map();const k=key(a.x,a.z,a.f);a.visited.set(k,(a.visited.get(k)??0)+1);a.goal=null;a.path=[];a.scan=3.2;if(a!==this.robot)a.dwell=a.type==='human'?3:2;return;}
  if(!a.path.length||this.time>=a.nextThink)this.plan(a);if(!a.path.length){a.heading+=dt;return;}
  const next=a.path[0];
  if(next.f!==a.f){const busy=this.agents.some(b=>b!==a&&b.stair);const occupied=this.agents.some(b=>b!==a&&b.f===next.f&&distance(b,next)<1.2);if(busy||occupied){a.status='Waiting for clear stairs';return;}a.stair={t:0,from:a.f};a.goal??=next;return;}
  const dx=next.x-a.x,dz=next.z-a.z,len=Math.hypot(dx,dz);if(len<.001){a.path.shift();return;}a.heading=Math.atan2(dz,dx);
  // A forward look is still inside the finite view cone. Navigation never reads hidden walls.
  if(!this.world.segmentClear(a,next,.16)){const k=key(next.x,next.z,next.f);a.bumps??=new Map();a.bumps.set(k,this.time);if(a===this.robot){a.yieldRoute=false;a.retreatForHuman=false;this.log(a.name,'Near-field bumper: unseen obstacle ahead, replanning');}a.path=[];a.nextThink=0;a.scan=.8;a.status='Obstacle detected / replanning';return;}
  const base=a.type==='robot'?.95:a.type==='human'?.7:a.type==='dog'?.85:.65;
  let speed=base;
  for(const b of this.agents){if(b===a||b.stair||b.f!==a.f)continue;const d=distance(a,b);if(d<2&&a.seen.has(b.id))speed=Math.min(speed,base*.5);}
  const step=Math.min(len,dt*speed),candidate={x:a.x+dx/len*step,z:a.z+dz/len*step,f:a.f};
  // Swept near-field safety bumper is distinct from the limited visual mapping sensor.
  if(this.agents.some(b=>b!==a&&b.stair&&Math.hypot(candidate.x-23,candidate.z-9)<1.2)){a.status='Waiting for reserved stair landing';return;}
  const other=this.agents.find(b=>b!==a&&!b.stair&&b.f===a.f&&distance(candidate,b)<(a.type==='robot'||b.type==='robot'?1.05:.72));
  if(other){if(a.type==='human'&&other===this.robot){this.waitForRobot(a);return;}if(!a.wasYielding){a.yields++;if(a===this.robot)this.avoids++;}a.wasYielding=true;a.status=`Giving way to ${other.name}`;a.wait=(a.wait??0)+dt;
   if(a.wait>1.8){const forbidden=new Set(this.agents.filter(b=>b!==a&&b.f===a.f&&distance(a,b)<3).flatMap(b=>{const out=[];for(let x=Math.floor(b.x)-1;x<=Math.ceil(b.x)+1;x++)for(let z=Math.floor(b.z)-1;z<=Math.ceil(b.z)+1;z++)if(Math.hypot(x-b.x,z-b.z)<1.25)out.push(key(x,z,b.f));return out;}));const detour=route(a,a.goal,k=>a.memory.get(k)?.blocked===true||forbidden.has(k),[...a.landmarks.values()].some(l=>l.type==='stairs'));if(detour?.length){a.path=detour;a.nextThink=this.time+4;}
    else {const choices=[],away=Math.atan2(a.z-other.z,a.x-other.x);for(const length of [1.3,.8,.4])for(const angle of [0,.45,-.45,.9,-.9,1.4,-1.4]){const theta=away+angle,p={x:a.x+Math.cos(theta)*length,z:a.z+Math.sin(theta)*length,f:a.f};if(!this.world.segmentClear(a,p,.24))continue;let safe=true;for(let i=1;i<=12&&safe;i++){const q={x:a.x+(p.x-a.x)*i/12,z:a.z+(p.z-a.z)*i/12,f:a.f};safe=this.agents.every(b=>b===a||b.stair||b.f!==a.f||distance(q,b)>(a.type==='robot'||b.type==='robot'?1.05:.72));}if(safe)choices.push({p,score:distance(p,other)-Math.abs(angle)*.2});}choices.sort((x,y)=>y.score-x.score);if(choices[0]){a.path=[choices[0].p];a.nextThink=this.time+5;a.retreatForHuman=a===this.robot&&other.type==='human';a.status='Moving aside / clearing the way';}}
    a.wait=0;}
   return;
  }
  a.wait=0;a.wasYielding=false;a.x=candidate.x;a.z=candidate.z;a.distance+=step;a.status=a.yieldRoute?'Moving around waiting pedestrian':a.goal.label??'Moving';if(len<=step+.001){a.path.shift();if(!a.path.length&&a.yieldRoute){a.yieldRoute=false;a.nextThink=0;}if(!a.path.length&&a.retreatForHuman){a.yieldPause=2;a.retreatForHuman=false;}}
  if(a===this.robot)this.battery=Math.max(0,this.battery-dt*.009-step*.015);
 }
 update(dt){if(!this.running)return;let remaining=Math.min(dt,.15)*this.speed;while(remaining>1e-6){const s=Math.min(.06,remaining);remaining-=s;this.time+=s;for(const a of this.agents)this.stepAgent(a,s);if(this.time-this.lastSense>.2){this.lastSense=this.time;for(const a of this.agents){this.sense(a);a.trail.push({x:a.x,z:a.z,f:a.f});if(a.trail.length>1800)a.trail.shift();}this.coverage=[...this.robot.memory.values()].filter(v=>!v.blocked).length/this.walkableCount;}}
 }
 get walkableCount(){if(!this._count){this._count=0;for(let f=0;f<2;f++)for(let x=1;x<W;x++)for(let z=1;z<D;z++)if(!this.world.navBlocked(x,z,f))this._count++;}return this._count;}
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
  if(type==='trash'){const o={id:`spill-${++this.counter}`,name:'New litter',type:'trash',category:'litter',x:Math.max(1,Math.min(23,Math.round(a.x))),z:Math.max(1,Math.min(17,Math.round(a.z+2))),y:0,rot:0,size:{w:.3,d:.25,h:.12},w:.3,d:.25,h:.12,f:a.f,solid:false,active:true,mobility:'movable',affordances:['pick-up','dispose'],parts:[],interactive:false};if(w.navBlocked(o.x,o.z,o.f))o.z=Math.round(a.z);o.access={x:o.x,z:o.z};o.room=w.roomContaining(o)?.id??w.roomAt(o)?.id;w.addObject(o);this.log('Scene','New litter added; MOMO must see it to discover it');return o;}
  if(type==='lights'){for(const r of w.rooms)r.light=true;this.log('Scene','All room lights are on; waiting for inspection');}
 }
 addAgents(){for(let i=0;i<6;i++){const f=i%2;let p;for(let x=3;x<23&&!p;x++)for(let z=8;z<=10&&!p;z++)if(!this.agents.some(a=>a.f===f&&Math.hypot(a.x-x,a.z-z)<1.2))p={x,z,f};if(!p)continue;const n=this.agents.length;this.agents.push({id:`agent-${n}`,name:`Visitor ${n-6}`,type:'human',...p,heading:0,color:colors[n%colors.length],range:5,fov:115*Math.PI/180,memory:new Map(),landmarks:new Map(),seen:new Map(),objectMemory:new Map(),path:[],trail:[],distance:0,status:'Exploring a new environment',goal:null,dwell:0,scan:0,nextThink:0,stair:null,reuse:0,yields:0});}this.log('Experiment','Added 6 visitors with empty maps to compare shared knowledge');}
}
