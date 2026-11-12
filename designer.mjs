// Environment designer (primary function).
//  * Manual "choose your own adventure": two variants of the current parent environment run
//    side by side (live, in Web Workers); the designer picks one, and two new variations are
//    generated from the pick. The lineage is kept.
//  * Automated evolution: a (1+λ) evolution strategy. Each epoch mutates the best environment
//    λ times, evaluates every candidate by the aggregate performance of its agents, keeps the
//    best, and repeats for N epochs.
// Every option is drawn as a whole-building plan (all five floors at once).
import {createWorld,FLOORS,W,D,LINKS} from './world.mjs?v=20261112v';
import {defaultGenome,mutate,describeGenome,clone,ZONE_KINDS} from './env.mjs?v=20261112v';

let uid=0;
export class Pool{
 constructor(n){this.n=n;this.build();}
 build(){this.workers=Array.from({length:this.n},()=>new Worker(new URL('./evolve-worker.mjs?v=20261112v',import.meta.url),{type:'module'}));this.free=[...this.workers];this.queue=[];this.jobs=new Map();
  for(const w of this.workers)w.onmessage=e=>{const j=this.jobs.get(e.data.id);if(!j)return;j.onMsg?.(e.data);if(e.data.type==='done'){this.jobs.delete(e.data.id);j.res(e.data);this.free.push(w);this.next();}};}
 run(genome,opts,onMsg){return new Promise(res=>{this.queue.push({genome,opts,onMsg,res});this.next();});}
 next(){while(this.free.length&&this.queue.length){const w=this.free.pop(),j=this.queue.shift(),id=++uid;j.worker=w;this.jobs.set(id,j);w.postMessage({cmd:'run',id,genome:j.genome,...j.opts});}}
 stopAll(){for(const w of this.workers)w.terminate();for(const j of this.jobs.values())j.res(null);for(const j of this.queue)j.res(null);this.build();}
}

// ---------------------------------------------------------------- whole-building plan ---
const TYPE_FILL={workspace:'#dbe6f0',meeting:'#e3def2',pantry:'#f3e3cf',print:'#e6ead6',reception:'#f1dcdb',lounge:'#f3ecd0',office:'#d8ece4',server:'#dde1ea',restroom:'#dcedf2',wellness:'#f2dde6',corridor:'#f4f3ee'};
const worldCache=new Map();export function worldFor(g){const k=JSON.stringify(g);if(!worldCache.has(k)){if(worldCache.size>24)worldCache.delete(worldCache.keys().next().value);worldCache.set(k,createWorld(g));}return worldCache.get(k);}
export function layoutFor(canvas,cols=2){const pad=16,head=16,cw=(canvas.width-pad*(cols+1))/cols,s=Math.min(cw/W,(canvas.height-pad-(head+pad)*Math.ceil(FLOORS/cols))/(Math.ceil(FLOORS/cols)*D));
 return Array.from({length:FLOORS},(_,f)=>({f,s,ox:pad+(f%cols)*(W*s+pad),oy:head+pad+Math.floor(f/cols)*(D*s+head+pad)}));}
export function drawBuilding(canvas,world,snap=null,{cols=2,title=null}={}){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fbfbf7';ctx.fillRect(0,0,canvas.width,canvas.height);
 const L=layoutFor(canvas,cols),g=world.genome;
 for(const {f,s,ox,oy}of L){const X=x=>ox+x*s,Y=z=>oy+z*s;
  ctx.fillStyle='#55625b';ctx.font='600 11px DM Sans, sans-serif';ctx.fillText(`L${f+1}`,ox,oy-5);
  for(const r of world.rooms)if(r.f===f){const b=r.bounds;ctx.fillStyle=TYPE_FILL[r.type]??'#eee';ctx.fillRect(X(b.x0),Y(b.z0),(b.x1-b.x0)*s,(b.z1-b.z0)*s);}
  ctx.fillStyle='#c4c7bf';for(const o of world.objects)if(o.f===f&&o.solid&&o.aabb&&o.aabb.y1<2.4)ctx.fillRect(X(o.aabb.x0),Y(o.aabb.z0),Math.max(1,(o.aabb.x1-o.aabb.x0)*s),Math.max(1,(o.aabb.z1-o.aabb.z0)*s));
  const areas=[...world.areas.filter(a=>a.f===f&&!a.dynamic),...(snap?.areas??[]).filter(a=>a.f===f)];
  for(const a of areas){const k=ZONE_KINDS[a.kind];ctx.fillStyle=k.color+(k.type==='hindrance'?'66':'55');ctx.fillRect(X(a.x0),Y(a.z0),(a.x1-a.x0)*s,(a.z1-a.z0)*s);ctx.strokeStyle=k.color;ctx.lineWidth=1;ctx.strokeRect(X(a.x0),Y(a.z0),(a.x1-a.x0)*s,(a.z1-a.z0)*s);}
  ctx.fillStyle='#2f3a35';for(const w of world.wallBoxes)if(w.f===f)ctx.fillRect(X(w.x0),Y(w.z0),Math.max(1,(w.x1-w.x0)*s),Math.max(1,(w.z1-w.z0)*s));
  for(const d of world.doors)if(d.f===f&&!d.open){ctx.fillStyle='#d9534f';ctx.fillRect(X(d.x-.55),Y(d.z-.18),1.1*s,.36*s);}
  for(const l of LINKS)if(f>=l.floors[0]&&f<=l.floors[1]){const open=!g||g.links[l.id]!==false,p=l.landing;ctx.strokeStyle=open?(l.kind==='lift'?'#6f5bd1':'#2f3a35'):'#d9534f';ctx.lineWidth=1.6;ctx.strokeRect(X(p.x-.5),Y(p.z-.5),s,s);
   if(!open){ctx.beginPath();ctx.moveTo(X(p.x-.5),Y(p.z-.5));ctx.lineTo(X(p.x+.5),Y(p.z+.5));ctx.moveTo(X(p.x+.5),Y(p.z-.5));ctx.lineTo(X(p.x-.5),Y(p.z+.5));ctx.stroke();}}
  const dock=world.object('dock'),bin=world.object('bin');ctx.fillStyle='#2c6756';if(dock.f===f)ctx.fillRect(X(dock.x-.4),Y(dock.z-.3),.8*s,.6*s);ctx.fillStyle='#8a6a3f';if(bin.f===f)ctx.fillRect(X(bin.x-.4),Y(bin.z-.3),.8*s,.6*s);
  if(snap){ctx.fillStyle='#d9534f';for(const [x,z,lf]of snap.litter)if(lf===f){ctx.fillRect(X(x)-1.5,Y(z)-1.5,3,3);}
   ctx.strokeStyle='rgba(44,103,86,.55)';ctx.lineWidth=1.2;ctx.beginPath();let prev=null;for(const [x,z,tf]of snap.trail){if(tf!==f){prev=null;continue;}if(prev&&Math.hypot(prev[0]-x,prev[1]-z)<2)ctx.lineTo(X(x),Y(z));else ctx.moveTo(X(x),Y(z));prev=[x,z];}ctx.stroke();
   for(const a of snap.agents)if(a.f===f){ctx.fillStyle=a.color;ctx.beginPath();ctx.arc(X(a.x),Y(a.z),a.type==='robot'?4:2.6,0,Math.PI*2);ctx.fill();if(a.type==='robot'){ctx.strokeStyle='#123';ctx.lineWidth=1;ctx.stroke();}}}}
 if(title){ctx.fillStyle='#24413a';ctx.font='600 12px DM Sans, sans-serif';ctx.fillText(title,16,12);}}

export function legendHTML(){return Object.entries(ZONE_KINDS).map(([,k])=>`<li title="${k.why}"><i style="background:${k.color}"></i>${k.label} <em>${k.type}</em></li>`).join('')+'<li><i style="background:#d9534f"></i>Shut door or closed stair/lift</li><li><i style="background:#2c6756"></i>Dock</li><li><i style="background:#8a6a3f"></i>Recycling</li>';}

// ---------------------------------------------------------------- designer controller ---
export function createDesigner(root,{getBase,onLoad,getClock,getWeather}){
 const $=s=>root.querySelector(s),n=Math.max(2,Math.min(4,(navigator.hardwareConcurrency||4)-1));let pool=new Pool(n);
 const state={parent:getBase(),round:0,lineage:[],options:[],auto:null,running:false};
 const fmt=p=>p?`<b>${p.score.toFixed(1)}</b> score · ${p.robot.tasksPerMin} tasks/min · staff trip efficiency ${(p.staff.meanEfficiency*100).toFixed(0)}% · ${p.staff.trips} trips · ${(p.robot.coverage*100).toFixed(1)}% mapped · ${p.robot.energyPerTask} energy/task`:'running…';
 const desc=g=>{const d=describeGenome(g);return `${d.links} · ${d.zones} · ${d.doors} · ${d.dock} · ${d.bin} · ${d.staff}`;};
 function showLineage(){$('#cyoa-lineage').innerHTML=state.lineage.map((l,i)=>`<li><b>Round ${i+1}</b>: chose <b>${l.pick}</b> (${l.score?.toFixed(1)??'–'} vs ${l.other?.toFixed(1)??'–'}) — ${l.changes.join('; ')||'baseline'}</li>`).join('')||'<li>No choice yet. The parent is the baseline environment.</li>';}
 async function newRound(){pool.stopAll();state.round++;const seconds=+$('#cyoa-seconds').value;state.options=['A','B'].map((label,i)=>{const m=mutate(state.parent,state.round*1000+i*17+7);return {label,genome:m.genome,changes:m.changes,perf:null,snap:null};});
  for(const o of state.options){const box=$(`#cyoa-${o.label}`);box.querySelector('.changes').textContent=o.changes.join(' · ');box.querySelector('.genome').textContent=desc(o.genome);box.querySelector('.perf').innerHTML=fmt(null);const cv=box.querySelector('canvas'),w=worldFor(o.genome);drawBuilding(cv,w);
   pool.run(o.genome,{seconds,live:true,clockStart:getClock(),weather:getWeather()},d=>{o.snap=d.snap;drawBuilding(cv,w,d.snap,{title:`t = ${d.snap.time.toFixed(0)} s${d.type==='done'?' · finished':''}`});box.querySelector('.perf').innerHTML=fmt(d.type==='done'?d.perf:d.snap.score);if(d.type==='done')o.perf=d.perf;box.querySelector('.bar i').style.width=`${Math.round((d.progress??1)*100)}%`;});}
  $('#cyoa-round').textContent=`Round ${state.round} · parent: ${state.parent.name}`;}
 function choose(label){const o=state.options.find(x=>x.label===label),other=state.options.find(x=>x.label!==label);if(!o)return;const score=o.perf?.score??o.snap?.score?.score,os=other?.perf?.score??other?.snap?.score?.score;
  state.lineage.push({pick:label,changes:o.changes,score,other:os,genome:clone(o.genome)});state.parent=clone(o.genome);showLineage();newRound();}
 $('#cyoa-start').onclick=()=>{state.parent=getBase();state.lineage=[];state.round=0;showLineage();newRound();};
 $('#cyoa-A .pick').onclick=()=>choose('A');$('#cyoa-B .pick').onclick=()=>choose('B');
 $('#cyoa-A .load').onclick=()=>state.options[0]&&onLoad(state.options[0].genome);$('#cyoa-B .load').onclick=()=>state.options[1]&&onLoad(state.options[1].genome);
 $('#cyoa-stop').onclick=()=>pool.stopAll();
 // Automated evolution.
 const chart=$('#evo-chart');function drawChart(h){const c=chart.getContext('2d'),W2=chart.width,H2=chart.height,pad=34;c.clearRect(0,0,W2,H2);c.fillStyle='#fbfbf7';c.fillRect(0,0,W2,H2);if(!h.length)return;
  const all=h.flatMap(e=>[e.best,e.mean,e.min]),lo=Math.max(0,Math.floor(Math.min(...all)/5)*5-5),hi=Math.min(100,Math.ceil(Math.max(...all)/5)*5+5),X=i=>pad+i*(W2-pad*1.6)/Math.max(1,h.length-1),Y=v=>H2-pad+-(v-lo)/(hi-lo)*(H2-pad*1.6);
  c.strokeStyle='#e2e2da';c.fillStyle='#7d8a74';c.font='10px sans-serif';for(let v=lo;v<=hi;v+=5){c.beginPath();c.moveTo(pad,Y(v));c.lineTo(W2-10,Y(v));c.stroke();c.fillText(v,6,Y(v)+3);}h.forEach((e,i)=>c.fillText(e.epoch,X(i)-3,H2-pad+14));c.fillText('epoch',W2-44,H2-6);
  c.fillStyle='rgba(143,182,217,.25)';c.beginPath();h.forEach((e,i)=>c[i?'lineTo':'moveTo'](X(i),Y(e.max)));[...h].reverse().forEach((e,j)=>c.lineTo(X(h.length-1-j),Y(e.min)));c.fill();
  for(const [k,col,wid]of [['mean','#8fb6d9',1.5],['best','#2c6756',2.5]]){c.strokeStyle=col;c.lineWidth=wid;c.beginPath();h.forEach((e,i)=>c[i?'lineTo':'moveTo'](X(i),Y(e[k])));c.stroke();for(const [i,e]of h.entries()){c.fillStyle=col;c.beginPath();c.arc(X(i),Y(e[k]),2.5,0,7);c.fill();}}
  c.fillStyle='#2c6756';c.fillText('best so far',W2-110,14);c.fillStyle='#8fb6d9';c.fillText('epoch mean (band = min–max)',W2-200,26);}
 async function evolve(){if(state.running){pool.stopAll();state.running=false;$('#evo-run').textContent='▶ Evolve';return;}
  state.running=true;$('#evo-run').textContent='■ Stop';const epochs=+$('#evo-epochs').value,lambda=+$('#evo-pop').value,seconds=+$('#evo-seconds').value,weather=getWeather(),log=$('#evo-log'),hist=[];log.innerHTML='';
  const ev=g=>pool.run(g,{seconds,live:false,clockStart:getClock(),weather});
  let best={genome:getBase(),changes:['baseline']};const r0=await ev(best.genome);if(!r0||!state.running)return;best.perf=r0.perf;best.snap=r0.snap;
  hist.push({epoch:0,best:best.perf.score,mean:best.perf.score,min:best.perf.score,max:best.perf.score,evaluated:1});drawChart(hist);drawBuilding($('#evo-best'),worldFor(best.genome),best.snap,{title:`Epoch 0 · baseline · score ${best.perf.score.toFixed(1)}`});
  log.insertAdjacentHTML('beforeend',`<li><b>Epoch 0</b> baseline scored ${best.perf.score.toFixed(1)}</li>`);let evaluated=1;
  for(let e=1;e<=epochs&&state.running;e++){$('#evo-status').textContent=`Epoch ${e}/${epochs}: evaluating ${lambda} mutations of the best environment in ${pool.n} parallel workers…`;
   const cands=Array.from({length:lambda},(_,i)=>{const m=mutate(best.genome,e*7919+i*104729);return {genome:m.genome,changes:m.changes};});
   const res=await Promise.all(cands.map(c=>ev(c.genome)));if(!state.running||res.some(r=>!r))break;evaluated+=lambda;
   res.forEach((r,i)=>{cands[i].perf=r.perf;cands[i].snap=r.snap;});const scores=cands.map(c=>c.perf.score),top=cands.reduce((a,b)=>b.perf.score>a.perf.score?b:a);const improved=top.perf.score>best.perf.score;if(improved)best=top;
   hist.push({epoch:e,best:best.perf.score,mean:scores.reduce((a,b)=>a+b,0)/scores.length,min:Math.min(...scores),max:Math.max(...scores),evaluated});drawChart(hist);
   log.insertAdjacentHTML('beforeend',`<li><b>Epoch ${e}</b> ${scores.map(v=>v.toFixed(1)).join(' / ')} → ${improved?`<b>kept</b> “${top.changes.join('; ')}” (${top.perf.score.toFixed(1)})`:`no improvement, best stays ${best.perf.score.toFixed(1)}`}</li>`);
   drawBuilding($('#evo-best'),worldFor(best.genome),best.snap,{title:`Best after epoch ${e} · score ${best.perf.score.toFixed(1)}`});$('#evo-best-desc').textContent=desc(best.genome);}
  state.best=best;state.history=hist;state.running=false;$('#evo-run').textContent='▶ Evolve';$('#evo-status').textContent=`Done: ${evaluated} environments evaluated over ${hist.length-1} epochs. Best score ${best.perf.score.toFixed(1)} (baseline ${hist[0].best.toFixed(1)}).`;}
 $('#evo-run').onclick=evolve;$('#evo-load').onclick=()=>state.best&&onLoad(state.best.genome);
 $('#evo-export').onclick=()=>{if(!state.history)return;const blob=new Blob([JSON.stringify({history:state.history,best:state.best?.genome,perf:state.best?.perf},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='evolution-run.json';a.click();};
 $('#designer-legend').innerHTML=legendHTML();showLineage();
 for(const id of ['A','B'])drawBuilding($(`#cyoa-${id} canvas`),worldFor(getBase()));drawBuilding($('#evo-best'),worldFor(getBase()));drawChart([]);
 return {state,redraw(){if(!state.options.length)for(const id of ['A','B'])drawBuilding($(`#cyoa-${id} canvas`),worldFor(getBase()));},dispose(){pool.stopAll();for(const w of pool.workers)w.terminate();}};
}
export {defaultGenome};
