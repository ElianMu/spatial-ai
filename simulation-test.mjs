import assert from 'node:assert/strict';
import {Simulation} from './simulation.mjs';
import {key,point,distance,linkPosition,LINKS,H,FLOORS,route} from './world.mjs';
const checks=[];
function check(name,fn){fn();checks.push(name);console.log(`PASS ${name}`);}

check('Limited initial knowledge and independent agent memories',()=>{const s=new Simulation();assert.equal(s.agents.length,12);assert.equal(s.robot.memory.size,0);assert.equal(s.robot.landmarks.size,1);assert(s.agents.slice(1).every(a=>a.memory.size===0&&a.landmarks.size===0));assert.equal(new Set(s.agents.map(a=>a.f)).size,FLOORS,'staff start on every floor');s.robot.memory.set('test',{blocked:true});assert(!s.agents[1].memory.has('test'));});
check('Finite cone, range, floors, and opaque walls',()=>{const s=new Simulation(),a=s.robot;a.x=30;a.z=10;a.heading=0;assert(s.canSee(a,{x:32,z:10,f:0}));assert(!s.canSee(a,{x:28,z:10,f:0}));assert(!s.canSee(a,{x:40,z:10,f:0}));assert(!s.canSee(a,{x:32,z:10,f:1}));a.x=6;a.z=10;a.heading=-Math.PI/2;assert(!s.canSee(a,{x:6,z:5,f:0}));s.sense(a);assert(s.robot.memory.size>0);assert.equal(s.agents[1].memory.size,0);});
check('Unseen tasks are not silently assigned',()=>{const s=new Simulation();s.enqueue('surface');assert.equal(s.tasks.length,0);});
check('Occupied room lights stay on; empty room lights switch off',()=>{const s=new Simulation(),hub=s.world.objects.find(o=>o.id==='hub-room-0-0'),r=s.world.rooms.find(r=>r.id===hub.room);Object.assign(s.agents[1],{x:6,z:4,f:0});const t={id:100,type:'lights',target:hub.id,progress:0};s.tasks.push(t);s.robot.goal={x:hub.x,z:hub.z,f:hub.f,taskId:t.id};s.perform(t,3);assert(r.light);assert.equal(t.state,'Waiting for vacancy');Object.assign(s.agents[1],{x:30,z:10});t.progress=0;s.perform(t,3);assert(!r.light);assert.equal(s.done.length,1);});
check('Garbage collection changes the environment and disposal empties the bin',()=>{const s=new Simulation(),o=s.world.objects.find(o=>o.type==='trash'),t={id:1,type:'trash',target:o.id,progress:0};s.tasks.push(t);s.perform(t,3);assert.equal(s.carry,1);assert(!o.active);const d={id:2,type:'dispose',target:'bin',progress:0};s.tasks.push(d);s.perform(d,3);assert.equal(s.carry,0);});
check('Furniture changes enter memory only after renewed observation',()=>{const s=new Simulation(),a=s.robot,o=s.world.objects.find(o=>o.id==='furniture-0-0');Object.assign(a,{x:o.access.x,z:o.access.z,f:0});a.heading=Math.atan2(o.z-a.z,o.x-a.x);s.sense(a);assert(a.objectMemory.has(o.id));const old=a.objectMemory.get(o.id).x;o.x+=.6;assert.equal(a.objectMemory.get(o.id).x,old);s.sense(a);assert.equal(a.objectMemory.get(o.id).x,o.x);assert(s.tasks.some(t=>t.type==='tidy'));});
check('Every stair flight and lift ride is continuous between matching landings',()=>{for(const l of LINKS){const lo=l.floors[0],hi=l.kind==='lift'?l.floors[1]:lo+1,a=linkPosition(l,lo,hi,0),b=linkPosition(l,lo,hi,1);
 assert.deepEqual([a.x,a.z,a.y],[l.landing.x,l.landing.z,0]);assert.deepEqual([b.x,b.z],[l.landing.x,l.landing.z]);assert(Math.abs(b.y-(hi-lo)*H)<1e-9);const d=linkPosition(l,hi,lo,0);assert.deepEqual([d.x,d.z,d.y],[b.x,b.z,b.y],'down starts where up ends');
 let last=0;for(let i=0;i<=200;i++){const p=linkPosition(l,lo,hi,i/200);assert(p.y>=last-1e-9);assert(Math.abs(p.y-last)<.3);last=p.y;}}});
check('Vertical routing respects which floors each stair or lift serves',()=>{const s=new Simulation(),free=k=>s.world.navBlocked(point(k).x,point(k).z,point(k).f),from={x:13,z:9,f:0},to={x:12,z:20,f:4};
 assert.equal(route(from,to,free,new Set(['stair-feature'])),null,'the feature stair stops at L3');
 const viaStair=route(from,to,free,new Set(['stair-west']));assert(viaStair&&viaStair.filter((p,i)=>i&&p.f!==viaStair[i-1].f).length===4,'four flights on the west stair');
 const viaLift=route(from,to,free,true);assert(viaLift.some((p,i)=>i&&p.f-viaLift[i-1].f===4),'a lift jumps four floors in one ride');});

const s=new Simulation();s.running=true;let minRobot=Infinity,minOther=Infinity;const robotFloors=new Set();
check('Long run: several floors, real tasks, landmark reuse and safe moving clearances',()=>{
 for(let i=0;i<12000;i++){
  s.update(.1);robotFloors.add(s.robot.f);
  assert(s.carry>=0&&s.carry<=3);assert(s.battery>=0&&s.battery<=100);
  for(let j=0;j<s.agents.length;j++){const a=s.agents[j];if(a.stair)continue;assert(!s.world.blocked(a.x,a.z,a.f),`${a.name} inside static obstacle`);for(let k=j+1;k<s.agents.length;k++){const b=s.agents[k];if(b.stair||b.f!==a.f)continue;const d=distance(a,b);if(a===s.robot||b===s.robot){minRobot=Math.min(minRobot,d);assert(d>=1.05-1e-6,`Robot clearance ${d}`);}else{minOther=Math.min(minOther,d);assert(d>=.72-1e-6,`Resident clearance ${d}`);}}}
 }
 assert(robotFloors.size>=2,'Robot must discover and use vertical circulation');assert(s.done.length>=20);assert(s.coverage>.15);assert(s.robot.reuse>0);for(const type of ['trash','surface','temperature','lights'])assert(s.done.some(t=>t.type===type),`No completed ${type}`);assert(s.agents.slice(1).every(a=>a.memory.size>20));assert(s.agents.filter(a=>a.type==='human'&&(a.flights??0)>0).length>=3,'staff travel between floors');
});
check('Accelerated motion still explores another floor and preserves safe clearances',()=>{const fast=new Simulation();fast.running=true;fast.speed=4;for(let i=0;i<3000;i++){fast.update(.1);for(let j=0;j<fast.agents.length;j++)for(let k=j+1;k<fast.agents.length;k++){const a=fast.agents[j],b=fast.agents[k];if(a.stair||b.stair||a.f!==b.f)continue;assert(distance(a,b)>=(a.type==='robot'||b.type==='robot'?1.05:.72)-1e-6);}}assert([...fast.robot.memory.keys()].some(k=>point(k).f>0));assert(fast.done.length>25);assert(fast.robot.reuse>0);});
check('Population growth starts newcomers with empty knowledge; reset restores baseline',()=>{s.addAgents();assert.equal(s.agents.length,18);assert(s.agents.slice(12).every(a=>a.memory.size===0));s.reset();assert.equal(s.agents.length,12);assert.equal(s.time,0);assert.equal(s.done.length,0);assert.equal(s.robot.memory.size,0);});
console.log(JSON.stringify({checks:checks.length,longRun:{minRobotCenterDistance:minRobot,minOtherCenterDistance:minOther,robotFloors:[...robotFloors].map(f=>`L${f+1}`)}},null,2));
