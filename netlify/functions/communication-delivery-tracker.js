const { json, supabaseRequest, verifyUser } = require('./_nova');

const STATUSES=new Set(['SENT','DELIVERED','FAILED','REPLIED']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),queueId=String(body.queue_id||'').trim(),status=String(body.status||'').toUpperCase();
 if(!org||!queueId||!STATUSES.has(status))return json(400,{error:'INVALID_DELIVERY_UPDATE'});
 const rows=await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,payload&limit=1`);const item=rows?.[0];if(!item)return json(404,{error:'COMMUNICATION_QUEUE_ITEM_NOT_FOUND'});
 await supabaseRequest(`communication_queue?id=eq.${encodeURIComponent(queueId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,delivery_updated_at:new Date().toISOString(),delivery_updated_by:user.id||null})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_COMMUNICATION_STATUS_UPDATED',source:'communication-delivery-tracker',payload:{queue_id:queueId,status}})});
 return json(200,{ok:true,queue_id:queueId,status,external_provider_not_called:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'COMMUNICATION_DELIVERY_TRACKING_FAILED'});}};
module.exports.run=run;
