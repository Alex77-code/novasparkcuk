const { json, supabaseRequest, verifyUser } = require('./_nova');

const PROVIDERS=new Set(['google_ads','meta_ads','analytics','cms','social']);
const ACTIONS=new Set(['PUBLISH','AD_CHANGE','DELETE','PAYMENT']);

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),queueId=String(body.queue_id||'').trim();
 if(!org||!queueId)return json(400,{error:'ORGANIZATION_AND_QUEUE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const rows=await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,payload&limit=1`);const item=rows?.[0];if(!item)return json(404,{error:'APPROVAL_REQUEST_NOT_FOUND'});
 if(item.status!=='APPROVED_PENDING_PROVIDER')return json(409,{error:'ACTION_NOT_APPROVED_FOR_PROVIDER',status:item.status});
 const action=String(item.payload?.action||'').toUpperCase(),provider=String(item.payload?.provider||'').toLowerCase();
 if(!ACTIONS.has(action)||!PROVIDERS.has(provider))return json(400,{error:'UNSUPPORTED_PROVIDER_ACTION'});
 const result={mode:'ADAPTER_REQUIRED',provider,action,credentials:'SERVER_SIDE_ONLY',external_request_sent:false,reason:'LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED'};
 await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'READY_FOR_ADAPTER',payload:{...(item.payload||{}),execution:result,prepared_at:new Date().toISOString()}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PROVIDER_ACTION_PREPARED',source:'provider-action-executor',payload:{queue_id:queueId,provider,action,external_request_sent:false}})});
 return json(200,{ok:true,status:'READY_FOR_ADAPTER',execution:result});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PROVIDER_EXECUTOR_FAILED'});}};
module.exports.run=run;
