// Frames of reference (notions of location) and distance metrics.
//
// LOCATION — the same occupant expressed in six frames:
//   world      metric building frame (x east, y up, z south), metres
//   grid       1 m navigation cell (i, j, floor) used by every planner
//   topology   floor → room / corridor (the semantic, graph frame)
//   landmark   offset from MOMO's dock (the robot's own anchor)
//   belief     MOMO's estimated pose (odometry + scan matching), robot only
//   geo        latitude / longitude / elevation of the real site (Manhattan grid is 28.9° off true north)
//
// DISTANCE — five metrics, each with its own unit:
//   euclidean  straight 3D line (m), ignores walls
//   grid       Manhattan steps on the 1 m grid (cells) plus floors changed
//   geodesic   walkable path length through doors, stairs and lifts (m), from A* on true geometry
//   time       travel time along that path (s), with region speeds, stair climbing and lift waits
//   topology   rooms entered + floors changed along that path (hops)
import {H,key,point,route,LINK_AT,linkLength} from './world.mjs?v=20261112v';
import {SITE,toGeo} from './realworld.mjs?v=20261112v';

export function frames(sim,a){const w=sim.world,room=w.roomAt(a)??w.roomContaining(a),dock=sim.home,est=a===sim.robot?a.localizer?.est:null,geo=toGeo(a.x,a.z,a.f*H);
 return {world:{x:+a.x.toFixed(2),y:+(a.f*H).toFixed(2),z:+a.z.toFixed(2)},grid:{i:Math.round(a.x),j:Math.round(a.z),floor:a.f},topology:{floor:`L${a.f+1}`,room:room?.name??'stair / lift',type:room?.type??'circulation'},
  landmark:{dx:+(a.x-dock.x).toFixed(1),dz:+(a.z-dock.z).toFixed(1),dy:+((a.f-dock.f)*H).toFixed(1),of:'dock'},belief:est?{x:+est.x.toFixed(2),z:+est.z.toFixed(2),errorCm:Math.round(Math.hypot(est.x-a.x,est.z-a.z)*100)}:null,
  geo:{lat:+geo.lat.toFixed(6),lon:+geo.lon.toFixed(6),elev:+geo.elev.toFixed(1),site:SITE.name}};}

// Ground-truth shortest walkable path (used for metrics, never by agents' planners).
export function geodesic(world,a,b,speed=1){const links=world.linkOpen,f=k=>{const p=point(k);return world.navBlocked(p.x,p.z,p.f);};
 const cost=k=>{const p=point(k),ar=world.areaAt(p.x,p.z,p.f);return 1/(ar?.speed??1);};
 const path=route({x:Math.round(a.x),z:Math.round(a.z),f:a.f},{x:Math.round(b.x),z:Math.round(b.z),f:b.f},k=>f(k)&&k!==key(b.x,b.z,b.f),links,(c,n)=>!world.edgeClear(c,n),cost);
 if(!path)return null;let metres=0,time=0,rooms=0,floors=0,prev={x:Math.round(a.x),z:Math.round(a.z),f:a.f},room=world.roomAt(prev)?.id;
 for(const p of path){if(p.f!==prev.f){const l=LINK_AT.get(key(prev.x,prev.z,prev.f)),L=linkLength(l,prev.f,p.f);metres+=L;time+=l.kind==='lift'?L/1.6+8:L/1.25;floors+=Math.abs(p.f-prev.f);}
  else{const ar=world.areaAt(p.x,p.z,p.f);metres+=1;time+=1/(speed*(ar?.speed??1));}const r=world.roomAt(p)?.id;if(r&&r!==room){rooms++;room=r;}prev=p;}
 return {metres:+metres.toFixed(1),time:+time.toFixed(1),rooms,floors,path};}

export function distances(world,a,b,speed=1){const g=geodesic(world,a,b,speed);
 return {euclidean:+Math.hypot(a.x-b.x,a.z-b.z,(a.f-b.f)*H).toFixed(1),grid:Math.abs(Math.round(a.x)-Math.round(b.x))+Math.abs(Math.round(a.z)-Math.round(b.z)),floorsApart:Math.abs(a.f-b.f),
  geodesic:g?.metres??null,time:g?.time??null,topology:g?g.rooms+g.floors:null,reachable:!!g};}
