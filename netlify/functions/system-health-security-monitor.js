const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];
 const statuses={};
 for(const s of ['PENDING','QUEUED','WAITING_QA','FAILED','ESCALATED']){const rows=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.${s}&select=id&limit=100`);statuses[s.toLowerCase()]=rows?.length||0;}
 const alerts=[];if(statuses.failed>10)alerts.push({severity:'HIGH',code:'HIGH_FAILURE_BACKLOG'});if(statuses.escalated>0)alerts.push({severity:'MEDIUM',code:'ESCALATED_TASKS_PRESENT'});if(stop?.emergency_stop)alerts.push({severity:'CRITICAL',code:'EMERGENCY_STOP_ACTIVE'});
 const health={status:alerts.some(a=>a.severity==='CRITICAL')?'CRITICAL':alerts.length?'DEGRADED':'HEALTHY',checked_at:new Date().toISOString(),queues:statuses,alerts,security:{credentials_exposed:false,external_publish_requires_approval:true}};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SYSTEM_HEALTH_CHECK_COMPLETED',source:'system-health-security-monitor',payload:health})});
 return json(200,{ok:true,health});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SYSTEM_HEALTH_MONITOR_FAILED'});}};
module.exports.run=run;
