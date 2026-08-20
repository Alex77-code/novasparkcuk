const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];
 const [queued,running,failed,openEscalations]=await Promise.all([
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=in.(QUEUED,AI_READY)&select=id&limit=1000`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.RUNNING&select=id&limit=1000`),
  supabaseRequest(`deliveries?organization_id=eq.${encodeURIComponent(org)}&status=eq.FAILED&select=id,retry_count&limit=1000`),
  supabaseRequest(`delivery_escalations?organization_id=eq.${encodeURIComponent(org)}&status=eq.OPEN&select=id&limit=1000`)
 ]);
 const health=(openEscalations?.length||0)>0||((failed||[]).length>0)?'DEGRADED':'HEALTHY';
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'OPS_HEALTH_CHECKED',source:'ops-health-monitor',payload:{health,queued:queued?.length||0,running:running?.length||0,failed_deliveries:failed?.length||0,open_escalations:openEscalations?.length||0,emergency_stop:Boolean(stop?.emergency_stop)}})});
 return json(200,{ok:true,health,emergency_stop:Boolean(stop?.emergency_stop),metrics:{queued:queued?.length||0,running:running?.length||0,failed_deliveries:failed?.length||0,open_escalations:openEscalations?.length||0}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'OPS_HEALTH_MONITOR_FAILED'});}};
module.exports.run=run;
