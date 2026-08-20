const { json, supabaseRequest, verifyUser } = require('./_nova');

const ACTIONS=new Set(['REVIEW_REWORK_QUEUE','RUN_DELIVERY_RECOVERY','ESCALATE_OPEN_FAILURES','SCALE_AGENT_CAPACITY','CONTINUE_NORMAL_OPERATIONS']);
const APPROVER_ROLES=new Set(['OWNER','ADMIN','MANAGER']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'').toUpperCase();
 if(!org||!ACTIONS.has(action))return json(400,{error:'INVALID_COO_ACTION'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();
 if(!APPROVER_ROLES.has(role))return json(403,{error:'COO_APPROVAL_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const now=new Date().toISOString();
 let result={action,status:'NO_OP'};
 if(action==='REVIEW_REWORK_QUEUE'){result={action,status:'REVIEW_REQUIRED',target:'REWORK_QUEUE'};}
 if(action==='RUN_DELIVERY_RECOVERY'){result={action,status:'RECOVERY_REQUIRED',target:'FAILED_DELIVERIES'};}
 if(action==='ESCALATE_OPEN_FAILURES'){result={action,status:'ESCALATION_REVIEW_REQUIRED',target:'OPEN_ESCALATIONS'};}
 if(action==='SCALE_AGENT_CAPACITY'){result={action,status:'CAPACITY_REVIEW_REQUIRED',target:'AGENT_POOL'};}
 if(action==='CONTINUE_NORMAL_OPERATIONS'){result={action,status:'NO_OP'};}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'COO_ACTION_EXECUTED',source:'coo-action-executor',payload:{...result,executed_by:user.id||null,role,executed_at:now,human_approval:true}})});
 return json(200,{ok:true,...result,execution_mode:'CONTROLLED',human_approval:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'COO_ACTION_EXECUTOR_FAILED'});}};
module.exports.run=run;
