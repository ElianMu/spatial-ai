// Acceptance scenarios A-H for the workplace upgrade. Run: node acceptance-test.mjs
// Uses only public simulation state; ground truth is consulted solely to score the robot.
import assert from 'node:assert/strict';
import {Simulation} from './simulation.mjs';
import {key,point,distance,route,FLOORS} from './world.mjs';
import {localBoxToWorld} from './catalog.mjs';
import {RES,NX} from './mapping.mjs';
const results={};const t0=performance.now();
function check(id,name,fn){const s=performance.now();const r=fn();results[id]={name,...r,ms:Math.round(performance.now()-s)};console.log(`PASS ${id} ${name}`,JSON.stringify(r));}
const robotRoute=(s,from,to)=>{const r=s.robot;return route(from,to,k=>r.memory.get(k)?.blocked===true,true,(c,n)=>{const p=point(c),q=point(n);return p.f===q.f&&r.map.edgeBlocked(p,q,p.f);});};

// One long run shared by B, C, D and H.
const sim=new Simulation();sim.running=true;const coverage=[];const ids=new Map();let stepMs=0;
for(let i=0;i<12000;i++){const a=performance.now();sim.update(.1);stepMs+=performance.now()-a;if(i%600===599){coverage.push(+sim.coverage.toFixed(3));for(const [id,b]of sim.robot.belief.objects)if(!ids.has(id))ids.set(id,b.firstSeen);}}
sim.refreshGraph();

check('A','Initial exploration from no prior knowledge',()=>{const s=new Simulation(),r=s.robot;assert.equal(r.memory.size,0);assert.equal(r.belief.objects.size,0);assert.equal([...r.landmarks.keys()].join(),'dock');
 s.running=true;const early=[];for(let i=0;i<600;i++){s.update(.1);if(i%100===99)early.push(+s.coverage.toFixed(3));}
 for(let i=1;i<early.length;i++)assert(early[i]>=early[i-1]-.005,'coverage should grow as the robot explores');assert(early.at(-1)>.02,'some of the building must be mapped after 60 s');
 // Nothing outside the sensor's reach: every remembered cell lies within 12 m of the robot's path.
 const trail=r.trail;for(const k of r.memory.keys()){const p=point(k);assert(trail.some(q=>q.f===p.f&&Math.hypot(q.x-p.x,q.z-p.z)<=12.5),`cell ${k} known without being in range`);}
 assert(coverage.at(-1)>coverage[0]);return {coverage60s:early.at(-1),coverageCurve1200s:coverage};});

check('B','Room recognition from observations',()=>{const regs=[...sim.robot.belief.regions.values()].filter(r=>r.label!=='unknown'&&r.area>=8);let correct=0;const rows=[];
 for(const r of regs){const votes={};for(const c of r.cells){const t=sim.world.roomContaining(point(c))?.type??'corridor';votes[t]=(votes[t]??0)+1;}const [truth]=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];const ok=truth===r.label;if(ok)correct++;rows.push(`${r.name}=${truth}${ok?'':' ✗'}`);}
 const types=new Set(regs.map(r=>r.label));for(const need of ['pantry','workspace','meeting','corridor'])assert(types.has(need),`must recognise a ${need}`);
 assert(correct/regs.length>=.85,`room accuracy ${correct}/${regs.length}`);assert(regs.length>=8);return {recognised:regs.length,correct,rooms:rows};});

check('C','Objects enter the scene graph with stable identifiers',()=>{const b=sim.robot.belief;let errs=[],dup=0;const seen=new Set();
 for(const [id,o]of b.objects){assert(sim.world.object(id),`unknown id ${id}`);assert.equal(o.id,id);if(seen.has(id))dup++;seen.add(id);assert.equal(o.firstSeen,ids.get(id)??o.firstSeen,'first-seen time must not change');const w=sim.world.object(id);if(o.present!==false&&o.type!=='trash'&&o.type!=='surface'&&w.active!==false)errs.push(Math.hypot(o.pose.x-w.x,o.pose.z-w.z));}
 const nodeIds=sim.graph.nodes.map(n=>n.id);assert.equal(new Set(nodeIds).size,nodeIds.length,'scene graph ids must be unique');
 const handle=sim.graph.nodes.find(n=>n.level==='part'&&n.label.includes('handle'));let chain=[];for(let n=handle;n;n=sim.graph.nodes.find(m=>m.id===n.parent))chain.unshift(n.level);
 assert.deepEqual(chain.slice(0,3),['house','floor','room']);assert(chain.includes('object')&&chain.at(-1)==='part');
 errs.sort((a,b)=>a-b);assert(b.objects.size>=100);assert(errs[Math.floor(errs.length*.95)]<.3,'95% of object positions within 0.3 m');
 return {objects:b.objects.size,duplicates:dup,p95PositionError:+errs[Math.floor(errs.length*.95)].toFixed(3),handleChain:chain.join(' > ')};});

check('D','Navigation between connected rooms respects walls, doors and obstacles',()=>{const regs=[...sim.robot.belief.regions.values()].filter(r=>r.label!=='unknown'&&r.label!=='corridor'&&r.area>=8);let ok=0,skipped=0;const r=sim.robot;
 // Plan only over space MOMO has actually observed as free (no optimism about unknown cells).
 const knownRoute=(from,to)=>route(from,to,k=>r.memory.get(k)?.blocked!==false,true,(c,n)=>{const p=point(c),q=point(n);return p.f===q.f&&r.map.edgeBlocked(p,q,p.f);});
 for(const reg of regs){const hall=[...r.belief.regions.values()].find(x=>x.label==='corridor'&&x.f===reg.f);if(!hall){skipped++;continue;}const from=point(hall.cells[0]);let path=null;
  for(const c of reg.cells.slice(0,12)){path=knownRoute(from,point(c));if(path)break;}if(!path){skipped++;continue;}let prev=from;
  for(const p of path){if(p.f===prev.f){assert(!sim.world.navBlocked(p.x,p.z,p.f),`route enters an obstacle at ${p.x},${p.z}`);assert(sim.world.edgeClear(key(prev.x,prev.z,prev.f),key(p.x,p.z,p.f)),'route cuts through geometry');}prev=p;}ok++;}
 assert(ok>=regs.length*.8,`routable rooms ${ok}/${regs.length}`);
 // Drive: send the robot to the pantry it recognised and check it arrives without collisions.
 const s=sim;const target=point(regs.find(x=>x.label==='pantry').cells[3]);r.goal={...target,label:'Test drive'};r.path=[];r.nextThink=0;s.tasks=[];s.auto=false;let arrived=false;
 for(let i=0;i<3000&&!arrived;i++){s.update(.1);for(const b of s.agents)if(b!==r&&!b.stair&&b.f===r.f&&!r.stair)assert(distance(r,b)>=1.05-1e-6);assert(r.stair||!s.world.blocked(r.x,r.z,r.f));if(r.f===target.f&&Math.hypot(r.x-target.x,r.z-target.z)<.6)arrived=true;}
 assert(arrived,'test drive must arrive');s.auto=true;return {roomsRoutable:ok,skipped,testDrive:'arrived'};});

check('E','Dynamic changes: moved chair and closed door update the map',()=>{const s=new Simulation(),r=s.robot,w=s.world;s.auto=false;
 const room=w.rooms.find(x=>x.f===0&&x.name==='Client meeting room'),door=w.object(room.door),inside=door.access[0],outside=door.access[1];
 // Put the robot inside the meeting room with a full view, map it, then move a chair.
 Object.assign(r,{x:inside.x,z:inside.z+.4,f:0,heading:Math.PI/2});for(let i=0;i<12;i++){r.heading+=.55;s.time+=.2;s.sense(r);}
 const before=r.map.stateAt(inside.x,inside.z+2,0);
 const moved=s.inject('move');assert(moved,'a known movable object must be movable');const mv=moved;
 r.heading=Math.atan2(mv.z-r.z,mv.x-r.x);let updated=false;for(let i=0;i<10&&!updated;i++){s.time+=.2;s.sense(r);const b=r.belief.objects.get(mv.id);updated=b&&Math.hypot(b.pose.x-mv.x,b.pose.z-mv.z)<.05;}
 assert(updated,'belief pose follows the moved object');assert(s.events.some(e=>e.msg.includes('Position changed')||e.msg.includes('moved')));
 const newOcc=r.map.stateAt(mv.x,mv.z,0)===2;
 // Door: observe it from the corridor, close it, observe again.
 Object.assign(r,{x:outside.x,z:outside.z-.8,heading:Math.PI/2});for(let i=0;i<4;i++){s.time+=.2;s.sense(r);}assert.equal(r.belief.objects.get(door.id)?.state,'open');
 const goal=w.reachableCells(room).at(-1),from={x:outside.x,z:outside.z-1,f:0};assert(robotRoute(s,from,goal),'route into the room while open');
 w.setDoor(door.id,false);for(let i=0;i<8;i++){s.time+=.2;s.sense(r);}
 assert.equal(r.belief.objects.get(door.id).state,'closed');assert(r.memory.get(key(door.x,door.z,0))?.blocked,'closed door blocks the doorway cell');assert.equal(r.memory.get(key(door.x,door.z,0))?.door,door.id,'blocked cell is tagged as a door, not a wall');
 assert(s.events.some(e=>e.msg.includes('temporarily blocked doorway')));const g=r.belief.graph(r,s.time);assert(g.edges.some(e=>e.type==='obstructed_by'&&e.to===door.id));
 const closedRoute=robotRoute(s,from,goal);assert(!closedRoute||!closedRoute.some(p=>p.x===door.x&&p.z===door.z),'no route through a closed door');
 w.setDoor(door.id,true);for(let i=0;i<10;i++){s.time+=.2;s.sense(r);}const reopened=robotRoute(s,from,goal);assert(reopened&&reopened.some(p=>p.x===door.x&&p.z===door.z),'route through the doorway restored after the door is seen open');
 return {room:room.name,movedObject:mv.id,beliefUpdated:updated,newCellOccupied:newOcc,mapBeforeMove:before,door:'closed→blocked & tagged→reopened'};});

check('F','Geometric consistency of colliders, parts and the robot map',()=>{const w=sim.world;let partsOutside=0,phantom=0,occ=0,support=0;
 for(const o of w.objects){if(!o.solid)continue;const union=o.localColliders.map(b=>localBoxToWorld(o,b)).reduce((a,b)=>({x0:Math.min(a.x0,b.x0),x1:Math.max(a.x1,b.x1),z0:Math.min(a.z0,b.z0),z1:Math.max(a.z1,b.z1)}));
  assert(Math.abs(union.x1-union.x0-o.w)<.02&&Math.abs(union.z1-union.z0-o.d)<.02,`${o.id} colliders disagree with its footprint`);
  for(const p of o.parts??[])if(p.box){const b=localBoxToWorld(o,p.box);if(b.x0<o.aabb.x0-.06||b.x1>o.aabb.x1+.06||b.z0<o.aabb.z0-.06||b.z1>o.aabb.z1+.06||b.y1>o.aabb.y1+.25)partsOutside++;}}
 for(const o of w.objects)if(o.support){const s=w.object(o.support);const y=o.y??0;if(y<s.aabb.y0-.02||y>s.aabb.y1+.02)support++; /* tops or internal shelves */}
 // Every occupied map cell should be explained by real geometry within one cell (noise tolerance).
 const map=sim.robot.map;for(let f=0;f<FLOORS;f++)for(let i=0;i<map.L[f].length;i++)if(map.state(f,i)===2){occ++;const ix=i%NX,iz=Math.floor(i/NX),x=ix*RES,z=iz*RES;let near=false;for(const [dx,dz]of [[0,0],[.25,0],[-.25,0],[0,.25],[0,-.25]])if(w.blocked(x+dx,z+dz,f)||w.collidersAt(x+dx,z+dz,f).some(c=>x+dx>=c.x0-.13&&x+dx<=c.x1+.13&&z+dz>=c.z0-.13&&z+dz<=c.z1+.13))near=true;if(!near)phantom++;}
 assert.equal(partsOutside,0);assert.equal(support,0,'supported objects rest on their support surface');assert(phantom/occ<.03,`phantom obstacle cells ${phantom}/${occ}`);
 return {occupiedCells:occ,phantomCells:phantom,phantomRate:+(phantom/occ).toFixed(4),partsOutsideBody:partsOutside};});

check('H','Performance of the simulation loop',()=>{const perSimSecond=stepMs/sim.time;assert(sim.perf.senseMs/sim.perf.senses<15,'robot sensing under 15 ms per scan');
 return {simSeconds:Math.round(sim.time),cpuMsPerSimSecond:+perSimSecond.toFixed(2),robotSenseMs:+(sim.perf.senseMs/sim.perf.senses).toFixed(2),sceneGraphMs:+sim.perf.graphMs.toFixed(2),graphNodes:sim.graph.nodes.length,graphEdges:sim.graph.edges.length,meanPoseErrorM:+sim.robot.localizer.meanError.toFixed(3),maxPoseErrorM:+sim.robot.localizer.maxError.toFixed(3),tasksDone:sim.done.length,coverage:+sim.coverage.toFixed(3)};});
console.log(JSON.stringify({totalMs:Math.round(performance.now()-t0),results},null,1));
