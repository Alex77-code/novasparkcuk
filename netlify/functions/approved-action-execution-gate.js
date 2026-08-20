const { json, supabaseRequest } = require('./_nova');
const { requireOwner } = require('./_owner-guard');
const PROVIDERS=new Set(['google_ads','meta_ads','analytics','cms','social']);
const ACTIONS=new Set(['PUBLISH','AD_CHANGE','DELETE','PAYMENT']);
async function run(event){
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),queueId=String(body.queue_id||'').trim();const decision=String(body.decision||'').toUpperCase();
 if(!org||!queueId||!['APPROVE','REJECT'].includes(decision))return json(400,{error:'INVALID_APPROVAL_EXECUTION_REQUEST'});
 const auth=await requireOwner(event,org);if(!auth.ok)return auth.response;
 const rows=await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,payload&limit=1`);const item=rows?.[0];if(!item)return json(404,{error:'APPROVAL_REQUEST_NOT_FOUND'});
 const action=String(item.payload?.action||'').toUpperCase(),provider=String(item.payload?.provider||'').toLowerCase();
 if(!ACTIONS.has(action)||!PROVIDERS.has(provider))return json(400,{error:'UNSUPPORTED_APPROVED_ACTION'});
 if(item.status!=='PENDING_APPROVAL')return json(409,{error:'APPROVAL_REQUEST_NOT_PENDING',status:item.status});
 if(decision==='REJECT'){
  await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',body:JSON.stringify({status:'REJECTED',payload:{...(item.payload||{}),decision,decided_by:auth.user.id||null,decided_at:new Date().toISOString()}})});
  return json(200,{ok:true,status:'REJECTED'});
 }
 await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',body:JSON.stringify({status:'APPROVED_PENDING_PROVIDER',payload:{...(item.payload||{}),decision,approved_by:auth.user.id||null,approved_at:new Date().toISOString(),execution_status:'NOT_SENT'}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'EXTERNAL_ACTION_APPROVED_FOR_PROVIDER',source:'approved-action-execution-gate',payload:{queue_id:queueId,action,provider,approved_by:auth.user.id||null}})});
 return json(200,{ok:true,status:'APPROVED_PENDING_PROVIDER',provider,action,execution_status:'NOT_SENT'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'APPROVED_ACTION_GATE_FAILED'});}};
module.exports.run=run;
