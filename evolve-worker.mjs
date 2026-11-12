// Web Worker: runs one environment genome headlessly. Messages:
//   {cmd:'run', id, genome, seconds, live, clockStart, weather}  -> {id, type:'tick'|'done', ...}
//   {cmd:'stop', id}
import {createEval,snapshot} from './evaluate.mjs?v=20261112v';
let current=null;
self.onmessage=e=>{const m=e.data;if(m.cmd==='stop'){if(current&&(m.id===undefined||current.id===m.id))current.stopped=true;return;}
 if(m.cmd!=='run')return;if(current)current.stopped=true;const job={id:m.id,stopped:false};current=job;
 const s=createEval(m.genome,{clockStart:m.clockStart,weather:m.weather});const total=m.seconds*10,chunk=m.live?8:300;let i=0;
 const tick=()=>{if(job.stopped)return;const end=Math.min(total,i+chunk);for(;i<end;i++)s.update(.1);
  if(i>=total){self.postMessage({id:job.id,type:'done',perf:s.performance(),snap:snapshot(s)});if(current===job)current=null;return;}
  if(m.live)self.postMessage({id:job.id,type:'tick',snap:snapshot(s),progress:i/total});setTimeout(tick,m.live?16:0);};
 tick();};
