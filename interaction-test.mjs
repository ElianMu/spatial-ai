import assert from 'node:assert/strict';
import {Simulation} from './simulation.mjs';
import {key,distance} from './world.mjs';
import {robotObservation} from './robot-knowledge.mjs';

function encounter(speed=1){
 const s=new Simulation();s.auto=false;s.agents=s.agents.slice(0,2);const [r,h]=s.agents;
 Object.assign(r,{x:14,z:9,f:0,scan:0,goal:{x:10,z:9,f:0,label:'Cross corridor'},path:[{x:13,z:9,f:0},{x:12,z:9,f:0},{x:11,z:9,f:0},{x:10,z:9,f:0}],nextThink:100});
 Object.assign(h,{x:12,z:9,f:0,scan:0,goal:{x:16,z:9,f:0,label:'Walk'},path:[{x:13,z:9,f:0},{x:14,z:9,f:0},{x:15,z:9,f:0},{x:16,z:9,f:0}],nextThink:100});
 for(const a of s.agents)for(let x=0;x<=24;x++)for(let z=0;z<=18;z++)a.memory.set(key(x,z,0),{blocked:s.world.navBlocked(x,z,0),time:0});
 let waits=0,resumed=false,robotMovedAside=false,heldPath,heldGoal;
 for(let i=0;i<1000;i++){
  const dt=.025*speed,wasWaiting=!!h.waitingForRobot,p={x:h.x,z:h.z};s.time+=dt;s.stepAgent(r,dt);s.stepAgent(h,dt);
  if(h.waitingForRobot){waits++;assert.equal(h.x,p.x);assert.equal(h.z,p.z);assert.equal(h.status,'Waiting for MOMO to clear the way');if(!wasWaiting){heldPath=JSON.stringify(h.path);heldGoal=JSON.stringify(h.goal);}else{assert.equal(JSON.stringify(h.path),heldPath,'A waiting person must not replan');assert.equal(JSON.stringify(h.goal),heldGoal);}}
  else if(wasWaiting)resumed=true;
  if(Math.abs(r.z-9)>.4)robotMovedAside=true;
  assert(distance(r,h)>=1.05-1e-6);
  if(resumed&&h.x>14.2&&r.x<11.5)break;
 }
 assert(waits>0,'Person must wait for the robot');assert(robotMovedAside,'Robot must move aside');assert(resumed,'Person must resume');assert(h.x>14.2,'Person must continue along original route');assert(r.x<11.5,'Robot must pass the waiting person');
 console.log(`PASS Stationary pedestrian / robot shoulder pass at ${speed}×`);
}
encounter();encounter(4);

const s=new Simulation(),r=s.robot;
assert.equal(robotObservation(r,0).cells.length,0);assert.equal(robotObservation(r,0).landmarks.length,0);
// The projection can read only a robot memory; it never receives a live world or population.
r.memory.set(key(2,9,0),{blocked:false,occupied:false,time:0});r.memory.set(key(3,9,0),{blocked:true,occupied:true,time:0});r.memory.set(key(4,9,1),{blocked:false,time:0});
r.seen.set('person',{name:'Dad',type:'human',x:2,z:9,f:0,time:0});r.seen.set('unseen-location',{name:'Mom',type:'human',x:23,z:17,f:0,time:0});
let view=robotObservation(r,0,0);assert.equal(view.cells.length,2);assert.equal(view.landmarks.length,1);assert.equal(view.occupants.length,1);assert(view.cells.every(c=>r.memory.has(key(c.x,c.z,c.f))));
view=robotObservation(r,5,0);assert.equal(view.cells.length,2,'Scanned cells persist');assert.equal(view.occupants.length,0,'Stale occupants disappear');
assert.equal(robotObservation(r,5,1).cells.length,1,'Floors remain independent');
s.reset();assert.equal(robotObservation(s.robot,0).cells.length,0,'Reset clears scanned geometry');
console.log('PASS Scanned-only reconstruction, floors, expiring observations and reset');
