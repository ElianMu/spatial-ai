// Robot-side perception, occupancy mapping and pose estimation.
//
// What is simulated vs. real:
//  * Sensors are simulated by ray casting the physical model (world.raycast): a 360° 2D LiDAR
//    at 0.18 m and a 105° RGB-D camera at 0.95 m whose 3D returns inside the robot's height band
//    are projected to a virtual scan (the depth-to-laserscan approach used on ROS robots).
//    Range noise is added; the robot never reads the occupancy of the world directly.
//  * Mapping is genuine log-odds occupancy grid mapping at 0.25 m from those scans.
//  * Pose: wheel odometry with simulated noise, corrected by correlative scan-to-map matching
//    against the robot's own, progressively built map. The estimate is reported and scored.
//  * NOT full SLAM: by default the map is registered with the simulator's body pose
//    (MAP_POSE='truth', i.e. "mapping with known poses"). Setting MAP_POSE='estimate' builds the
//    map from the estimate instead; without loop closure that drifts by up to ~0.5 m along the
//    48 m corridors, so it is kept as an experimental switch rather than the default.
import {W,D,H,FLOORS,NAV_BAND,EYE,key} from './world.mjs?v=20261112u';

export const MAP_POSE={mode:'truth'};
const PER_FLOOR=fn=>Array.from({length:FLOORS},fn);
// Cells are centred on multiples of RES so that 0.12 m walls on integer lines fall inside a
// single cell instead of straddling two (which lets grazing rays erase them).
export const RES=.25,NX=Math.round(W/RES)+1,NZ=Math.round(D/RES)+1;
export const cellOf=v=>Math.floor(v/RES+.5),centre=i=>i*RES;
export const LIDAR={height:.18,rays:360,range:12,noise:.012};
export const CAMERA={height:EYE.robot,fov:105*Math.PI/180,columns:64,pitches:[-38,-27,-18,-11,-6,-2,3].map(d=>d*Math.PI/180),range:6.5,noise:.01};
const L_FREE=-.45,L_OCC=.9,L_MIN=-3,L_MAX=3.5,OCC=.7,FREE=-.7;

// Small deterministic PRNG so runs and tests are reproducible.
export function rng(seed=7){let s=seed>>>0||1;const u=()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};return {u,n:()=>{let a=0;for(let i=0;i<6;i++)a+=u();return (a-3)*Math.SQRT2;}};}

export class OccupancyMap{
 constructor(){this.L=PER_FLOOR(()=>new Float32Array(NX*NZ));this.C=PER_FLOOR(()=>new Float32Array(NX*NZ));this.seen=PER_FLOOR(()=>new Uint8Array(NX*NZ));this.hitH=PER_FLOOR(()=>new Float32Array(NX*NZ));this.time=PER_FLOOR(()=>new Float32Array(NX*NZ));this.mx=PER_FLOOR(()=>new Float32Array(NX*NZ));this.mz=PER_FLOOR(()=>new Float32Array(NX*NZ));this.mn=PER_FLOOR(()=>new Uint16Array(NX*NZ));this.version=0;}
 idx(ix,iz){return ix>=0&&iz>=0&&ix<NX&&iz<NZ?iz*NX+ix:-1;}
 state(f,i){if(i<0)return 0;const l=this.L[f][i],c=this.C[f][i];if(l>OCC||c>OCC)return 2;if(this.seen[f][i]&&(l<FREE||c<FREE))return 1;return 0;}
 stateAt(x,z,f){return this.state(f,this.idx(cellOf(x),cellOf(z)));}
 // Bresenham-style traversal in grid units; free along the ray, occupied at the end point.
 integrate(layer,f,x0,z0,x1,z1,hit,h,t,flag){
  const g=layer[f],seen=this.seen[f],time=this.time[f];let ix=cellOf(x0),iz=cellOf(z0);const ex=cellOf(x1),ez=cellOf(z1);
  const dx=x1-x0,dz=z1-z0,sx=Math.sign(dx),sz=Math.sign(dz),tdx=dx?Math.abs(RES/dx):Infinity,tdz=dz?Math.abs(RES/dz):Infinity;
  const bx=ix*RES-RES/2,bz=iz*RES-RES/2;let tmx=dx?((sx>0?bx+RES-x0:x0-bx)/Math.abs(dx)):Infinity,tmz=dz?((sz>0?bz+RES-z0:z0-bz)/Math.abs(dz)):Infinity;
  for(let n=0;n<200;n++){if(ix===ex&&iz===ez)break;const i=this.idx(ix,iz);if(i>=0){g[i]=Math.max(L_MIN,g[i]+L_FREE);seen[i]|=flag;time[i]=t;}if(tmx<tmz){tmx+=tdx;ix+=sx;}else{tmz+=tdz;iz+=sz;}}
  const i=this.idx(ex,ez);if(i<0)return;seen[i]|=flag;time[i]=t;
  if(hit){g[i]=Math.min(L_MAX,g[i]+L_OCC);this.hitH[f][i]=Math.max(this.hitH[f][i]*.98,h);if(flag===1){const n=Math.min(40,this.mn[f][i]+1);this.mx[f][i]+=(x1-this.mx[f][i])/n;this.mz[f][i]+=(z1-this.mz[f][i])/n;this.mn[f][i]=n;}}else g[i]=Math.max(L_MIN,g[i]+L_FREE);
 }
 // Interpolated occupancy evidence used by the scan matcher.
 score(f,x,z){const gx=x/RES,gz=z/RES,ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,g=this.L[f];const at=(a,b)=>{const i=this.idx(a,b);return i<0?0:Math.max(-1,g[i]);};return at(ix,iz)*(1-u)*(1-v)+at(ix+1,iz)*u*(1-v)+at(ix,iz+1)*(1-u)*v+at(ix+1,iz+1)*u*v;}
 // Likelihood of a LiDAR end point: distance to the nearest mean surface point (sub-cell
 // precision, avoids the bias of scoring against cell centres).
 likelihood(f,x,z,sigma=.05){const ix=cellOf(x),iz=cellOf(z);let best=.09;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const i=this.idx(ix+a,iz+b);if(i<0||!this.mn[f][i]||this.L[f][i]<OCC)continue;const d=(this.mx[f][i]-x)**2+(this.mz[f][i]-z)**2;if(d<best)best=d;}return Math.exp(-best/(2*sigma*sigma));}
 // 1 m navigation cell derived from the fine map: central 0.5 x 0.5 m footprint.
 navCell(X,Z,f){const ix=cellOf(X)-1,iz=cellOf(Z)-1;let known=0,occ=false;for(let a=0;a<3;a++)for(let b=0;b<3;b++){const s=this.state(f,this.idx(ix+a,iz+b));if(s)known++;if(s===2)occ=true;}return known?{blocked:occ}:null;}
 // Robot-footprint sweep along a grid edge, using only observed obstacles.
 edgeBlocked(a,b,f,margin=.22,skipStart=false){const n=Math.max(2,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/(RES/2)));for(let i=skipStart?1:0;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;for(const [dx,dz]of [[0,0],[-margin,0],[margin,0],[0,-margin],[0,margin]])if(this.stateAt(x+dx,z+dz,f)===2)return true;}return false;}
 // Frontier cells: observed free cells with an unobserved 4-neighbour, clustered (8-connected).
 frontiers(f,minSize=3){const out=[],mark=new Uint8Array(NX*NZ),isF=(ix,iz)=>{const i=this.idx(ix,iz);if(i<0||this.state(f,i)!==1)return false;for(const [a,b]of [[1,0],[-1,0],[0,1],[0,-1]]){const j=this.idx(ix+a,iz+b);if(j>=0&&this.state(f,j)===0)return true;}return false;};
  for(let iz=1;iz<NZ-1;iz++)for(let ix=1;ix<NX-1;ix++){const i=iz*NX+ix;if(mark[i]||!isF(ix,iz))continue;const q=[[ix,iz]],cells=[];mark[i]=1;while(q.length){const [a,b]=q.pop();cells.push([a,b]);for(let da=-1;da<=1;da++)for(let db=-1;db<=1;db++){const j=this.idx(a+da,b+db);if(j<0||mark[j]||!isF(a+da,b+db))continue;mark[j]=1;q.push([a+da,b+db]);}}
   if(cells.length>=minSize){const cx=cells.reduce((s,c)=>s+c[0],0)/cells.length,cz=cells.reduce((s,c)=>s+c[1],0)/cells.length;out.push({f,size:cells.length,x:cx*RES,z:cz*RES,cells});}}
  return out;}
 stats(f){let free=0,occ=0;for(let i=0;i<NX*NZ;i++){const s=this.state(f,i);if(s===1)free++;else if(s===2)occ++;}return {free,occupied:occ,unknown:NX*NZ-free-occ,areaFree:free*RES*RES};}
}

// ------------------------------------------------------------------ simulated sensors ---
export function lidarScan(world,pose,f,noise){const out=[],y=LIDAR.height;for(let k=0;k<LIDAR.rays;k++){const a=k/LIDAR.rays*Math.PI*2,th=pose.heading+a,dx=Math.cos(th),dz=Math.sin(th);
  const hit=world.raycast(f,pose.x,y,pose.z,dx,0,dz,LIDAR.range,{ceiling:false});const r=hit?Math.max(.05,hit.t+noise.n()*LIDAR.noise*(1+hit.t*.4)):LIDAR.range;out.push({a,r,hit:!!hit,h:y+.1});}return out;}
export function depthScan(world,pose,f,noise){
 const cols=[],points=[],floorPts=[],y0=CAMERA.height;
 for(let c=0;c<CAMERA.columns;c++){const a=-CAMERA.fov/2+CAMERA.fov*(c+.5)/CAMERA.columns,th=pose.heading+a,ch=Math.cos(th),sh=Math.sin(th);let band=Infinity,floor=0,top=0;
  const hits=[];
  for(const p of CAMERA.pitches){const cp=Math.cos(p),dx=ch*cp,dy=Math.sin(p),dz=sh*cp;const hit=world.raycast(f,pose.x,y0,pose.z,dx,dy,dz,CAMERA.range/cp,{});if(!hit)continue;
   const t=hit.t*(1+noise.n()*CAMERA.noise),hx=t*cp,hy=y0+dy*t;if(hit.floor){floor=Math.max(floor,hx);if(c%4===0)floorPts.push({x:pose.x+ch*hx,z:pose.z+sh*hx});continue;}if(hit.ceiling)continue;
   hits.push([hx,hy]);points.push({x:pose.x+ch*hx,y:hy,z:pose.z+sh*hx,owner:hit.collider.owner,type:hit.collider.type});
   if(hy>=NAV_BAND[0]&&hy<=NAV_BAND[1]+.05&&hx<band)band=hx;}
  for(const [hx,hy]of hits)if(band<Infinity&&hx<=band+.3)top=Math.max(top,hy);
  cols.push({a,band:band<Infinity?band:null,floor,top});}
 return {cols,points,floorPts};
}

// ------------------------------------------------------------------ pose estimation ---
export class Localizer{
 constructor(pose,seed=11){this.est={x:pose.x,z:pose.z,heading:pose.heading,f:pose.f};this.prev={x:pose.x,z:pose.z,heading:pose.heading};this.noise=rng(seed);this.corrections=0;this.matched=0;this.lastScore=0;this.maxError=0;this.errorSum=0;this.samples=0;}
 // Integrate noisy odometry from the body's true motion since the previous call.
 predict(truth){const dx=truth.x-this.prev.x,dz=truth.z-this.prev.z,dth=Math.atan2(Math.sin(truth.heading-this.prev.heading),Math.cos(truth.heading-this.prev.heading));
  const ds=Math.hypot(dx,dz),dir=Math.atan2(dz,dx)-this.prev.heading;const n=this.noise;
  const ds2=ds*(1+n.n()*.02),dth2=dth*(1+n.n()*.01)+n.n()*(.006*ds+.0005),dir2=dir+n.n()*.005*ds;
  const th=this.est.heading+dir2;this.est.x+=Math.cos(th)*ds2;this.est.z+=Math.sin(th)*ds2;this.est.heading+=dth2;this.prev={x:truth.x,z:truth.z,heading:truth.heading};}
 // Correlative scan matching of the current LiDAR endpoints against the existing map.
 correct(map,scan,f){const pts=scan.filter((s,i)=>s.hit&&i%6===0&&s.r<7);if(pts.length<15)return false;
  const evalPose=(x,z,h,sg)=>{let s=0;for(const p of pts){const th=h+p.a;s+=map.likelihood(f,x+Math.cos(th)*p.r,z+Math.sin(th)*p.r,sg);}return s/pts.length;};
  const e=this.est;let support=0;for(const p of pts){const th=e.heading+p.a,x=e.x+Math.cos(th)*p.r,z=e.z+Math.sin(th)*p.r;let near=false;for(let a=-1;a<=1&&!near;a++)for(let b=-1;b<=1&&!near;b++)if(map.stateAt(x+a*RES,z+b*RES,f)===2)near=true;if(near)support++;}
  if(support<pts.length*.35)return false;
  let best={x:e.x,z:e.z,h:e.heading};
  // Coarse-to-fine search with a narrowing likelihood kernel and a weak odometry prior.
  for(const [dp,dh,sg,n]of [[.07,.014,.12,2],[.03,.006,.06,1],[.012,.0025,.04,1]]){const c={...best};let bs=-Infinity;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++)for(let k=-n;k<=n;k++){const x=c.x+i*dp,z=c.z+j*dp,h=c.h+k*dh;const prior=((x-e.x)**2+(z-e.z)**2)*1.5+((h-e.heading)**2)*12;const s=evalPose(x,z,h,sg)-prior;if(s>bs+1e-6){bs=s;best={x,z,h,s};}}}
  // Accept only a clear improvement, and cap each step: in geometrically degenerate places (a long
  // corridor) the likelihood is flat along one axis and odometry is more trustworthy.
  const base=evalPose(e.x,e.z,e.heading,.04),gain=evalPose(best.x,best.z,best.h,.04)-base;this.matched++;this.lastScore=base+gain;
  if(gain>.015){const dx=best.x-e.x,dz=best.z-e.z,d=Math.hypot(dx,dz),k=d>.04?.04/d:1;this.corrections++;e.x+=dx*k;e.z+=dz*k;e.heading+=Math.max(-.015,Math.min(.015,best.h-e.heading));}return true;}
 // Stair landings and the dock are surveyed landmarks; arriving there re-anchors the estimate.
 reset(pose){this.est={x:pose.x,z:pose.z,heading:pose.heading,f:pose.f};this.prev={x:pose.x,z:pose.z,heading:pose.heading};}
 track(truth){const e=Math.hypot(this.est.x-truth.x,this.est.z-truth.z);this.maxError=Math.max(this.maxError,e);this.errorSum+=e;this.samples++;return e;}
 get meanError(){return this.samples?this.errorSum/this.samples:0;}
}

// One complete sensing + mapping cycle for the robot. Returns the raw scans for visualisation.
export function robotPerceive(world,robot,map,localizer,time){
 const f=robot.f,truth={x:robot.x,z:robot.z,heading:robot.heading};
 localizer.predict(truth);
 const lidar=lidarScan(world,truth,f,localizer.noise),depth=depthScan(world,truth,f,localizer.noise);
 localizer.correct(map,lidar,f);localizer.est.f=f;
 const e=MAP_POSE.mode==='estimate'?localizer.est:truth;
 for(const s of lidar){const th=e.heading+s.a;map.integrate(map.L,f,e.x,e.z,e.x+Math.cos(th)*s.r,e.z+Math.sin(th)*s.r,s.hit,s.h,time,1);}
 for(const c of depth.cols){const th=e.heading+c.a,r=c.band??c.floor;if(r<.3)continue;map.integrate(map.C,f,e.x,e.z,e.x+Math.cos(th)*r,e.z+Math.sin(th)*r,c.band!==null,c.top,time,2);}
 // The robot body occupies its own footprint, so those cells are known to be free.
 for(let ix=cellOf(e.x-.15);ix<=cellOf(e.x+.15);ix++)for(let iz=cellOf(e.z-.15);iz<=cellOf(e.z+.15);iz++){const i=map.idx(ix,iz);if(i<0||Math.hypot(ix*RES-e.x,iz*RES-e.z)>.18)continue;map.L[f][i]=Math.min(map.L[f][i],-1);map.C[f][i]=Math.min(map.C[f][i],-1);map.seen[f][i]|=4;}
 map.version++;localizer.track(truth);
 // Refresh the 1 m navigation memory inside sensor range from the fine map.
 const R=9;for(let x=Math.max(1,Math.floor(e.x-R));x<=Math.min(W-1,Math.ceil(e.x+R));x++)for(let z=Math.max(1,Math.floor(e.z-R));z<=Math.min(D-1,Math.ceil(e.z+R));z++){const c=map.navCell(x,z,f);if(!c)continue;const k=key(x,z,f),old=robot.memory.get(k);robot.memory.set(k,{blocked:c.blocked,occupied:c.blocked,time,door:old?.door});}
 return {lidar,depth,pose:{...e},estimate:{...localizer.est}};
}
