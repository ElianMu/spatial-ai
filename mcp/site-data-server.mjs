#!/usr/bin/env node
// Minimal MCP server (stdio, JSON-RPC 2.0, no dependencies) that serves the same real-world
// site data the web app uses: true sun position and Open-Meteo hourly weather for the site.
// Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
//   {"mcpServers":{"hearth-site":{"command":"node","args":["/ABSOLUTE/PATH/spatial ai/mcp/site-data-server.mjs"]}}}
import {SITE,solarPosition,sunVector,fetchWeather,conditionsAt,toGeo} from '../realworld.mjs?v=20261112v';
const tools=[
 {name:'site_info',description:'The real site the Hearth Tower simulation is placed on (coordinates, grid rotation, time zone).',inputSchema:{type:'object',properties:{}}},
 {name:'sun_position',description:'True solar azimuth/elevation at the site for an ISO date-time, plus the sun vector in the building frame.',inputSchema:{type:'object',properties:{datetime:{type:'string',description:'ISO 8601, e.g. 2026-11-12T15:00:00Z'}},required:['datetime']}},
 {name:'site_weather',description:'Hourly temperature, cloud cover and irradiance for the site on a date (Open-Meteo forecast or ERA5 archive).',inputSchema:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'}},required:['date']}},
 {name:'building_to_geo',description:'Convert a building-frame point (x,z metres, floor) to latitude/longitude/elevation.',inputSchema:{type:'object',properties:{x:{type:'number'},z:{type:'number'},floor:{type:'integer'}},required:['x','z']}},
];
async function call(name,a){
 if(name==='site_info')return SITE;
 if(name==='sun_position'){const d=new Date(a.datetime),sp=solarPosition(d);return {...sp,vector:sunVector(sp)};}
 if(name==='site_weather'){const w=await fetchWeather(new Date(`${a.date}T12:00:00Z`));return {source:w.source,url:w.url,hours:w.hours.filter(h=>h.t.startsWith(a.date))};}
 if(name==='building_to_geo')return toGeo(a.x,a.z,(a.floor??0)*3.6);
 throw new Error(`unknown tool ${name}`);}
let buf='';process.stdin.setEncoding('utf8');
process.stdin.on('data',async chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;let m;try{m=JSON.parse(line);}catch{continue;}
 const reply=r=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...r})+'\n');
 if(m.method==='initialize')reply({result:{protocolVersion:m.params?.protocolVersion??'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'hearth-site-data',version:'1.0.0'}}});
 else if(m.method==='tools/list')reply({result:{tools}});
 else if(m.method==='tools/call'){try{const out=await call(m.params.name,m.params.arguments??{});reply({result:{content:[{type:'text',text:JSON.stringify(out,null,1)}]}});}catch(e){reply({result:{content:[{type:'text',text:`Error: ${e.message}`}],isError:true}});}}
 else if(m.id!==undefined)reply({error:{code:-32601,message:'Method not found'}});}});
void conditionsAt;
