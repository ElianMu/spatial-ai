import {key,point} from './world.mjs?v=20261112t';

// This projection deliberately accepts the robot's memory, never the physical world.
export function robotObservation(robot,time,floor=robot.f){
 const cells=[...robot.memory.entries()].filter(([k])=>point(k).f===floor).map(([k,v])=>({...point(k),blocked:v.occupied??v.blocked,recent:time-v.time<.55}));
 // A landmark or sighting counts as scanned when its cell or a neighbouring cell is (objects such
 // as the dock sit against walls, inside cells that are themselves obstacles).
 const known=p=>p.f===floor&&[[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>robot.memory.has(key(p.x+dx,p.z+dz,p.f)));
 const landmarks=[...robot.landmarks.values()].filter(known).map(p=>({...p}));
 const occupants=[...robot.seen.entries()].filter(([,p])=>known(p)&&time-p.time<4).map(([id,p])=>({id,...p}));
 return {floor,cells,landmarks,occupants,totalCells:robot.memory.size};
}
