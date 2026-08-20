const { json, supabaseRequest, verifyUser } = require('./_nova');

const HIGH_RISK=new Set(['PUBLISH','AD_CHANGE','DELETE','PAYMENT']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();const action=String(body.action||'').toUpperCase();const provider=String(body.provider||'').toLowerCase();const payload=body.payload||{};
 if(!org||!action||!provider)return json(400,{error:'ORGANIZATION_ACTION_PROVIDER_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const requiresApproval=HIGH_RISK.has(action);
 if(!requiresApproval)return json(200,{ok:true,decision:'AUTO_ALLOWED',action,provider});
 const rows=await supabaseRequest('communication_queue',{method:'POST',body:JSON.stringify({organization_id:org,channel:'INTERNAL_APPROVAL',status:'PENDING_APPROVAL',payload:{action,provider,payload,requested_by:user.id||null,requested_at:new Date().toISOString()}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'EXTERNAL_ACTION_APPROVAL_REQUESTED',source:'external-action-approval-queue',payload:{action,provider,queue_id:rows?.[0]?.id||null}})});
 return json(200,{ok:true,decision:'HOLD_FOR_APPROVAL',approval_required:true,queue_id:rows?.[0]?.id||null});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'ACTION_APPROVAL_QUEUE_FAILED',message:e.message});}};
module.exports.run=run;
