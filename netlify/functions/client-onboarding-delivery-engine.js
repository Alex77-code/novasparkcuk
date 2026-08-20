const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','SALES','OPERATIONS','PROJECT_MANAGER']);
const STATUSES=new Set(['ONBOARDING','ACTIVE','PAUSED','COMPLETED']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),clientId=String(body.client_id||'').trim();if(!org||!clientId)return json(400,{error:'ORGANIZATION_AND_CLIENT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'ONBOARDING_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const client=(await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,email,status,services,goals&limit=1`))?.[0];if(!client)return json(404,{error:'CLIENT_NOT_FOUND'});
 const services=Array.isArray(body.services)?body.services:(Array.isArray(client.services)?client.services:[]);if(!services.length)return json(400,{error:'SERVICES_REQUIRED'});
 const status=String(body.status||'ONBOARDING').toUpperCase();if(!STATUSES.has(status))return json(400,{error:'INVALID_ONBOARDING_STATUS'});
 const rows=await supabaseRequest('onboarding_records',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,client_id:clientId,status,services,goals:Array.isArray(body.goals)?body.goals:(client.goals||[]),contact_preferences:body.contact_preferences||{},start_date:body.start_date||new Date().toISOString().slice(0,10),created_by:user.id||null,created_at:new Date().toISOString()})});const onboarding=rows?.[0];if(!onboarding)return json(500,{error:'ONBOARDING_CREATE_FAILED'});
 const projectRows=[];for(const service of services){const p=(await supabaseRequest('projects',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,client_id:clientId,name:`${client.name} - ${service}`,status:'PLANNED',delivery_service:String(service),created_by:user.id||null,created_at:new Date().toISOString()})}))?.[0];if(p)projectRows.push(p);}
 await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:status==='ACTIVE'?'ACTIVE':'ONBOARDING',updated_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_ONBOARDING_STARTED',source:'client-onboarding-delivery-engine',payload:{client_id:clientId,onboarding_id:onboarding.id,services,project_ids:projectRows.map(p=>p.id),status}})});
 return json(200,{ok:true,onboarding,projects:projectRows,next_step:'CREATE_DELIVERY_TASKS'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_ONBOARDING_FAILED'});}};
module.exports.run=run;
