// Real-world data for the secondary function: the building is sited on a real plot and its
// daylight, solar heat and glare follow true sun geometry and recorded / forecast weather.
//
//  * Site: Avery Hall, Columbia University (1172 Amsterdam Ave, New York). Coordinates are
//    approximate (±20 m); the Manhattan street grid runs 28.9° east of true north, so the
//    building's "north" façade really faces 28.9°.
//  * Sun: NOAA-style solar position (declination, equation of time, hour angle) for any instant,
//    returned as a 3D unit vector in the building frame -> drives the 3D sun light and shadows.
//  * Weather: hourly temperature, cloud cover and irradiance from the Open-Meteo API
//    (forecast endpoint for recent days, ERA5 archive for historic dates). No key needed.
//    Offline / in tests, a clear-sky model is used and labelled as modelled.
//  * Effects: per-window solar gain heats rooms (MOMO's temperature checks read these values)
//    and low direct sun through glazing creates time-varying "glare" hindrance regions.
export const SITE={name:'Avery Hall, Columbia University, New York',lat:40.80827,lon:-73.96127,elev:35,gridRotationDeg:28.9,tz:'America/New_York'};
const RAD=Math.PI/180,TH=SITE.gridRotationDeg*RAD;

// Building metric frame -> WGS84 (building centre at the site coordinate).
export function toGeo(x,z,y=0,cx=24,cz=15){const dx=x-cx,dn=-(z-cz);const E=dx*Math.cos(TH)+dn*Math.sin(TH),N=-dx*Math.sin(TH)+dn*Math.cos(TH);
 return {lat:SITE.lat+N/111320,lon:SITE.lon+E/(111320*Math.cos(SITE.lat*RAD)),elev:SITE.elev+y};}

// Solar position for a Date (UTC instant). Azimuth clockwise from true north, degrees.
export function solarPosition(date,lat=SITE.lat,lon=SITE.lon){const jd=date.getTime()/86400000+2440587.5,n=jd-2451545.0;
 const L=((280.460+0.9856474*n)%360+360)%360,g=(((357.528+0.9856003*n)%360+360)%360)*RAD;
 const lam=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*RAD,eps=(23.439-0.0000004*n)*RAD;
 const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam)),dec=Math.asin(Math.sin(eps)*Math.sin(lam));
 const gmst=((18.697374558+24.06570982441908*n)%24+24)%24,ha=((gmst*15+lon)*RAD-ra);
 const la=lat*RAD,el=Math.asin(Math.sin(la)*Math.sin(dec)+Math.cos(la)*Math.cos(dec)*Math.cos(ha));
 let az=Math.atan2(-Math.sin(ha),Math.tan(dec)*Math.cos(la)-Math.sin(la)*Math.cos(ha))/RAD;az=(az+360)%360;
 return {azimuth:az,elevation:el/RAD,declination:dec/RAD};}

// Unit vector pointing at the sun, in the building frame (x local east, y up, z local south).
export function sunVector(sp){const e=sp.elevation*RAD,a=sp.azimuth*RAD,E=Math.cos(e)*Math.sin(a),N=Math.cos(e)*Math.cos(a);
 return {x:E*Math.cos(TH)-N*Math.sin(TH),y:Math.sin(e),z:-(E*Math.sin(TH)+N*Math.cos(TH))};}

// Simple clear-sky irradiance (W/m²) used when no measured data is available.
export function clearSky(elevDeg){if(elevDeg<=0)return {dni:0,dhi:0,ghi:0};const s=Math.sin(elevDeg*RAD),am=1/Math.max(.05,s),dni=1353*Math.pow(.7,Math.pow(am,.678)),dhi=.1*dni;return {dni,dhi,ghi:dni*s+dhi};}

const ymd=d=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:SITE.tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);return p;};
// Fetch hourly weather around a date. Returns a series or throws (caller falls back to the model).
export async function fetchWeather(date=new Date()){const day=ymd(date),ageDays=(Date.now()-date.getTime())/86400000;
 const vars='temperature_2m,cloud_cover,shortwave_radiation,direct_normal_irradiance,diffuse_radiation';
 const url=ageDays>6?`https://archive-api.open-meteo.com/v1/archive?latitude=${SITE.lat}&longitude=${SITE.lon}&start_date=${day}&end_date=${day}&hourly=${vars}&timezone=${encodeURIComponent(SITE.tz)}`
  :`https://api.open-meteo.com/v1/forecast?latitude=${SITE.lat}&longitude=${SITE.lon}&hourly=${vars}&past_days=7&forecast_days=3&timezone=${encodeURIComponent(SITE.tz)}`;
 const r=await fetch(url);if(!r.ok)throw new Error(`Open-Meteo ${r.status}`);const j=await r.json(),h=j.hourly;
 return {source:ageDays>6?'Open-Meteo ERA5 archive (historic)':'Open-Meteo forecast API (measured + forecast)',url,utcOffsetSeconds:j.utc_offset_seconds,
  hours:h.time.map((t,i)=>({t,temp:h.temperature_2m[i],cloud:h.cloud_cover[i],ghi:h.shortwave_radiation[i],dni:h.direct_normal_irradiance[i],dhi:h.diffuse_radiation[i]}))};}

// Local "YYYY-MM-DDTHH:00" key for a Date at the site.
export function siteHourKey(d){const f=new Intl.DateTimeFormat('en-CA',{timeZone:SITE.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(d),g=t=>f.find(x=>x.type===t).value;return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:00`;}
export function siteClock(d){return new Intl.DateTimeFormat('en-US',{timeZone:SITE.tz,weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}

// Conditions at an instant: sun geometry + weather (measured if available, else modelled).
export function conditionsAt(date,series=null){const sp=solarPosition(date),sun=sunVector(sp);let w=series?.hours.find(h=>h.t===siteHourKey(date)),source=series?.source;
 if(!w){const cs=clearSky(sp.elevation);w={temp:null,cloud:0,ghi:cs.ghi,dni:cs.dni,dhi:cs.dhi};source='clear-sky model (no measured data loaded)';}
 return {date,sun:sp,vector:sun,temp:w.temp,cloud:w.cloud,dni:w.dni??0,dhi:w.dhi??0,ghi:w.ghi??0,source,daylight:Math.max(0,Math.min(1,(sp.elevation+4)/14))};}

const NORMAL={N:{x:0,z:-1},S:{x:0,z:1},W:{x:-1,z:0},E:{x:1,z:0}};
// Room temperatures and glare regions from the conditions. Returns {temps: Map(roomId→°C), glare:[area]}.
export function solarEffects(world,c){const temps=new Map(),glare=[],gain=new Map();
 for(const w of world.windows){const n=NORMAL[w.side],cos=c.vector.x*n.x+c.vector.z*n.z,area=w.width*(w.head-w.sill);
  const direct=c.sun.elevation>0&&cos>0?c.dni*cos:0;
  const q=.4*area*(direct+.5*c.dhi);gain.set(w.room,(gain.get(w.room)??0)+q);
  // Low, strong direct sun reaches deep into the room: a glare strip inside the window.
  if(c.dni>180&&cos>.3&&c.sun.elevation>2&&c.sun.elevation<38){const r=world.room(w.room);if(!r)continue;const depth=Math.max(.8,Math.min(4,w.head/Math.tan(c.sun.elevation*RAD)*cos));const b=r.bounds,a=w.width/2+.3;
   const g=w.side==='N'?{x0:w.x-a,x1:w.x+a,z0:b.z0,z1:b.z0+depth}:w.side==='S'?{x0:w.x-a,x1:w.x+a,z0:b.z1-depth,z1:b.z1}:w.side==='W'?{x0:b.x0,x1:b.x0+depth,z0:w.z-a,z1:w.z+a}:{x0:b.x1-depth,x1:b.x1,z0:w.z-a,z1:w.z+a};
   glare.push({id:`glare-${w.id}`,kind:'glare',f:w.f,x0:Math.max(b.x0,g.x0),x1:Math.min(b.x1,g.x1),z0:Math.max(b.z0,g.z0),z1:Math.min(b.z1,g.z1),dynamic:true});}}
 const out=c.temp??12;
 for(const r of world.rooms){const fa=Math.max(6,(r.bounds.x1-r.bounds.x0)*(r.bounds.z1-r.bounds.z0)),q=gain.get(r.id)??0;temps.set(r.id,+(21.2+.06*(out-12)+q/(fa*9)+(r.type==='server'?3:0)).toFixed(1));}
 return {temps,glare};}
