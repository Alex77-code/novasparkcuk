const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const pending=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.PENDING&select=id&limit=50`);
 const queued=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.QUEUED&select=id&limit=50`);
 const qa=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.WAITING_QA&select=id&limit=50`);
 const failed=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.FAILED&select=id&limit=50`);
 const snapshot={pending:pending?.length||0,queued:queued?.length||0,waiting_qa:qa?.length||0,failed:failed?.length||0,checked_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AUTONOMOUS_OPERATING_LOOP_TICK',source:'autonomous-operating-loop',payload:snapshot})});
 return json(200,{ok:true,snapshot,actions:{dispatch_pending:snapshot.pending>0,execute_queued:snapshot.queued>0,run_qa:snapshot.waiting_qa>0,recover_failed:snapshot.failed>0}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AUTONOMOUS_LOOP_FAILED',message:e.message});}};
module.exports.run=run;
