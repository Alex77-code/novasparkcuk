const { json, supabaseRequest, verifyUser } = require('./_nova');

const ACTIONS=new Set(['ALERT','REWORK','RETRY_DELIVERY','ESCALATE','NOOP']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),ruleId=String(body.rule_id||'').trim();
 if(!org||!ruleId)return json(400,{error:'ORGANIZATION_AND_RULE_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];
 const rule=(await supabaseRequest(`automation_rules?id=eq.${encodeURIComponent(ruleId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,event_name,action,status,conditions&limit=1`))?.[0];if(!rule)return json(404,{error:'AUTOMATION_RULE_NOT_FOUND'});
 if(!ACTIONS.has(rule.action)||rule.status!=='READY')return json(409,{error:'AUTOMATION_RULE_NOT_EXECUTABLE',status:rule.status,action:rule.action});
 if(stop?.emergency_stop&&rule.action!=='ESCALATE')return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const action=rule.action,now=new Date().toISOString();
 await supabaseRequest(`automation_rules?id=eq.${encodeURIComponent(ruleId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'EXECUTING',executed_by:user.id||null,executed_at:now})});
 let result={action,status:'QUEUED'};
 if(action==='NOOP')result={action,status:'COMPLETED'};
 if(action==='ALERT')result={action,status:'NOTIFICATION_REQUIRED',next:'notification-dispatcher'};
 if(action==='REWORK')result={action,status:'REWORK_REQUIRED',next:'ai-rework-retry-engine'};
 if(action==='RETRY_DELIVERY')result={action,status:'RETRY_REQUIRED',next:'delivery-monitor-retry-engine'};
 if(action==='ESCALATE')result={action,status:'ESCALATED',next:'human-operations-review'};
 await supabaseRequest(`automation_rules?id=eq.${encodeURIComponent(ruleId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'COMPLETED',execution_result:result,completed_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AUTOMATION_ACTION_EXECUTED',source:'automation-action-executor',payload:{rule_id:ruleId,event_name:rule.event_name,action,result}})});
 return json(200,{ok:true,rule_id:ruleId,event_name:rule.event_name,action,result,status:'COMPLETED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AUTOMATION_ACTION_EXECUTION_FAILED'});}};
module.exports.run=run;
