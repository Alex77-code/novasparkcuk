const { json, supabaseRequest, verifyUser } = require('./_nova');

const TARGET_SERVICES=['SEO','CONTENT','SOCIAL','PAID_ADS','WEBSITE','ANALYTICS'];

async function runProspectingEngine(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const goals=await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_amount,currency,deadline&limit=10`);
 const existing=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,company_name,email,website,status,source&limit=1000`);
 const created=[];
 for(const goal of goals||[]){
   const title=`Prospecting plan for ${goal.title}`;
   const duplicate=(existing||[]).some(l=>l.source==='CEO_PROSPECTING' && l.status==='RESEARCH_QUEUE' && l.company_name===title);
   if(duplicate) continue;
   const lead=(await supabaseRequest('leads',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,company_name:title,status:'RESEARCH_QUEUE',source:'CEO_PROSPECTING',notes:`Research verified UK business prospects likely to need ${TARGET_SERVICES.join(', ')}. Goal: ${goal.title}. Do not invent contact details; store source evidence.`})}))?.[0];
   if(lead){created.push(lead.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PROSPECTING_QUEUE_CREATED',source:'prospecting-engine',payload:{goal_id:goal.id,lead_id:lead.id,services:TARGET_SERVICES}})});}
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CRO',action:'PROSPECTING_SCAN',resource_type:'leads',metadata:{active_goals:(goals||[]).length,queues_created:created.length}})});
 return {ok:true,queues_created:created.length,lead_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runProspectingEngine());}catch(e){console.error(e);return json(500,{error:'PROSPECTING_ENGINE_FAILED',message:e.message});}};
module.exports.runProspectingEngine=runProspectingEngine;
