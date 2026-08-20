const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHECKLIST=['WELCOME_SENT','CONTRACT_PENDING','BRAND_ASSETS_PENDING','ACCESS_REQUEST_PENDING','GOALS_PENDING','KICKOFF_PENDING'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),leadId=String(body.lead_id||'').trim(),projectId=String(body.project_id||'').trim();
 if(!org||!leadId||!projectId)return json(400,{error:'ORGANIZATION_LEAD_PROJECT_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const existing=await supabaseRequest(`onboarding_checklists?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,items&limit=1`);
 const items=CHECKLIST.map(item=>({key:item,status:'PENDING'}));
 let result;
 if(existing?.[0]) result=await supabaseRequest(`onboarding_checklists?id=eq.${encodeURIComponent(existing[0].id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({lead_id:leadId,project_id:projectId,status:'IN_PROGRESS',items,updated_at:new Date().toISOString()})});
 else result=await supabaseRequest('onboarding_checklists',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,lead_id:leadId,project_id:projectId,status:'IN_PROGRESS',items,created_by:user.id||null,created_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_ONBOARDING_STARTED',source:'client-onboarding-engine',payload:{lead_id:leadId,project_id:projectId,checklist_id:result?.[0]?.id||existing?.[0]?.id||null,steps:CHECKLIST}})});
 return json(200,{ok:true,status:'IN_PROGRESS',project_id:projectId,checklist:CHECKLIST.map(key=>({key,status:'PENDING'})),automation:{client_messages_not_sent:true,requires_communication_provider:true}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_ONBOARDING_FAILED',message:e.message});}};
module.exports.run=run;
