// Headless evaluation of one environment genome: run the full agent simulation (no rendering,
// no scene-graph rebuilds) for a fixed horizon and return the performance report. Used by the
// environment designer (manual A/B rounds and automated evolution), in Web Workers or Node.
import {Simulation} from './simulation.mjs?v=20261112u';
export const EVAL_DEFAULTS={seconds:180};
export function createEval(genome,opts={}){const s=new Simulation(genome,{lite:true,clockStart:opts.clockStart,weather:opts.weather,timeScale:opts.timeScale});s.running=true;return s;}
export function step(s,simSeconds){for(let i=0;i<simSeconds*10;i++)s.update(.1);}
export function evaluate(genome,opts={}){const s=createEval(genome,opts);step(s,opts.seconds??EVAL_DEFAULTS.seconds);return s.performance();}
// Compact live state for 2D plan drawing on the main thread.
export function snapshot(s){const r=s.robot;return {time:s.time,score:s.performance(),
 agents:s.agents.map(a=>({x:a.renderPos?.x??a.x,z:a.renderPos?.z??a.z,f:a.stair?Math.min(a.stair.from,a.stair.to):a.f,type:a.type,color:a.color,moving:!!a.stair})),
 trail:r.trail.filter((p,i)=>i%3===0).map(p=>[+p.x.toFixed(1),+p.z.toFixed(1),p.f]),
 areas:s.world.areas.filter(a=>a.dynamic).map(a=>({kind:a.kind,f:a.f,x0:a.x0,x1:a.x1,z0:a.z0,z1:a.z1})),
 litter:s.world.objects.filter(o=>o.type==='trash'&&o.active!==false).map(o=>[o.x,o.z,o.f])};}
