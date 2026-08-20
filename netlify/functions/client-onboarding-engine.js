const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHECKLIST=['WELCOME_SENT','CONTRACT_PENDING','BRAND_ASSETS_PENDING','ACCESS_REQUEST_PENDING','GOALS_PENDING','KICKOFF_PENDING'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),leadId=String(body.lead_id||'').trim(),projectId=String(body.project_id||'').trim();
 if(!org||!leadId||!projectId)return json(400,{error:'ORGANIZATION_LEAD_PROJECT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const requested=Array.isArray(body.completed_steps)?body.completed_steps.filter(x=>CHECKLIST.includes(String(x))):[];
 const existing=await supabaseRequest(`onboarding_checklists?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,items&limit=1`);
 const previous=existing?.[0]?.items||[];const completed=new Set([...previous.filter(x=>x.status==='COMPLETED').map(x=>x.key),...requested]);
 const items=CHECKLIST.map(key=>({key,status:completed.has(key)?'COMPLETED':'PENDING'}));const status=items.every(x=>x.status==='COMPLETED')?'READY_FOR_KICKOFF':'IN_PROGRESS';
 const payload={lead_id:leadId,project_id:projectId,status,items,updated_at:new Date().toISOString()};let result;
 if(existing?.[0])result=await supabaseRequest(`onboarding_checklists?id=eq.${encodeURIComponent(existing[0].id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
 else result=await supabaseRequest('onboarding_checklists',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...payload,organization_id:org,created_by:user.id||null,created_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_ONBOARDING_UPDATED',source:'client-onboarding-engine',payload:{lead_id:leadId,project_id:projectId,checklist_id:result?.[0]?.id||existing?.[0]?.id||null,status,completed_steps:[...completed]}})});
 return json(200,{ok:true,status,project_id:projectId,checklist:items,automation:{client_messages_not_sent:true,requires_communication_provider:true}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_ONBOARDING_FAILED',message:e.message});}};
module.exports.run=run;
