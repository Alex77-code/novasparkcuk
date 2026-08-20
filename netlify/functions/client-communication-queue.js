const { json, supabaseRequest, verifyUser } = require('./_nova');

async function queueApprovedDelivery(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const reports=await supabaseRequest(`events?organization_id=eq.${org.id}&event_type=eq.CLIENT_DELIVERY_REPORT_SENT&select=id,payload&limit=50`);
 const queued=[];
 for(const report of reports||[]){
   const taskId=report.payload?.task_id;
   if(!taskId) continue;
   const existing=await supabaseRequest(`communication_queue?organization_id=eq.${org.id}&task_id=eq.${encodeURIComponent(taskId)}&select=id&limit=1`);
   if(existing?.length) continue;
   await supabaseRequest('communication_queue',{method:'POST',body:JSON.stringify({organization_id:org.id,task_id:taskId,channel:'CLIENT_PORTAL',status:'QUEUED',payload:{report:report.payload},created_at:new Date().toISOString()})});
   queued.push(taskId);
 }
 return {ok:true,queued:queued.length,task_ids:queued};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await queueApprovedDelivery());}catch(e){console.error(e);return json(500,{error:'CLIENT_COMMUNICATION_QUEUE_FAILED',message:e.message});}};
module.exports.queueApprovedDelivery=queueApprovedDelivery;
