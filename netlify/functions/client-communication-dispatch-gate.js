const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['email','whatsapp']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),channel=String(body.channel||'email').toLowerCase();
 if(!org||!projectId||!CHANNELS.has(channel))return json(400,{error:'INVALID_DISPATCH_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const checklist=(await supabaseRequest(`onboarding_checklists?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,items&limit=1`))?.[0];if(!checklist)return json(404,{error:'ONBOARDING_CHECKLIST_NOT_FOUND'});
 const pending=(checklist.items||[]).filter(x=>x.status==='PENDING');
 const dispatch=pending.map(x=>({template:x.key,channel,status:'READY_FOR_PROVIDER',consent_required:true,external_request_sent:false}));
 await supabaseRequest('communication_queue',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,channel,status:'READY_FOR_PROVIDER',payload:{project_id:projectId,dispatch,requested_by:user.id||null,created_at:new Date().toISOString()}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_COMMUNICATION_READY_FOR_PROVIDER',source:'client-communication-dispatch-gate',payload:{project_id:projectId,channel,count:dispatch.length,external_request_sent:false}})});
 return json(200,{ok:true,status:'READY_FOR_PROVIDER',channel,count:dispatch.length,external_request_sent:false,requires_provider_and_consent:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'COMMUNICATION_DISPATCH_GATE_FAILED'});}};
module.exports.run=run;
