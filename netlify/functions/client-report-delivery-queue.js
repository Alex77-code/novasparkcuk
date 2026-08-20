const { json, supabaseRequest, verifyUser } = require('./_nova');

async function queue(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();const projectId=String(body.project_id||'').trim();if(!org||!projectId)return json(400,{error:'ORGANIZATION_AND_PROJECT_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const report={project_id:projectId,delivery_type:'CLIENT_REPORT',requires_approval:true,status:'QUEUED',queued_at:new Date().toISOString()};
 const existing=await supabaseRequest(`communication_queue?organization_id=eq.${encodeURIComponent(org)}&status=eq.QUEUED&select=id&limit=1`);
 if(existing?.length)return json(200,{ok:true,already_queued:true});
 const rows=await supabaseRequest('communication_queue',{method:'POST',body:JSON.stringify({organization_id:org,channel:'EMAIL',status:'QUEUED',payload:report})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_REPORT_QUEUED',source:'client-report-delivery-queue',payload:report})});
 return json(200,{ok:true,queued:true,queue_id:rows?.[0]?.id||null,requires_approval:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await queue(event);}catch(e){console.error(e);return json(500,{error:'REPORT_DELIVERY_QUEUE_FAILED',message:e.message});}};
module.exports.queue=queue;
