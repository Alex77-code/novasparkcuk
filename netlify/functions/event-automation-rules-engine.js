const { json, supabaseRequest, verifyUser } = require('./_nova');

const ACTIONS=new Set(['ALERT','REWORK','RETRY_DELIVERY','ESCALATE','NOOP']);
const DEFAULTS={QA_FAILED:'REWORK',DELIVERY_FAILED:'RETRY_DELIVERY',HUMAN_APPROVAL_REQUESTED:'ALERT',SYSTEM_CRITICAL:'ESCALATE'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),name=String(body.event_name||'').toUpperCase(),action=String(body.action||DEFAULTS[name]||'NOOP').toUpperCase();
 if(!org||!name||!ACTIONS.has(action))return json(400,{error:'INVALID_AUTOMATION_RULE'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop&&action!=='ESCALATE')return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const rule={organization_id:org,event_name:name,action,status:'READY',conditions:body.conditions||{},created_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('automation_rules',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(rule)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AUTOMATION_RULE_REGISTERED',source:'event-automation-rules-engine',payload:{rule_id:rows?.[0]?.id||null,event_name:name,action}})});
 return json(200,{ok:true,rule:rows?.[0]||rule,status:'READY'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AUTOMATION_RULES_FAILED'});}};
module.exports.run=run;
