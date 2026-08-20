const { json, supabaseRequest, verifyUser } = require('./_nova');

const AGENT_BY_TYPE={CLIENT_ONBOARDING:'account-manager',ACCESS_COLLECTION:'operations',STRATEGY_BASELINE:'strategy',CAMPAIGN_PLAN:'marketing',QA_SETUP:'qa'};
async function dispatch(event){
 const auth=event.headers.authorization||event.headers.Authorization;
 const user=await verifyUser(auth); if(!user)return {statusCode:401,body:{error:'AUTHENTICATION_REQUIRED'}};
 const body=JSON.parse(event.body||'{}'); const organizationId=String(body.organization_id||'').trim();
 if(!organizationId)return {statusCode:400,body:{error:'ORGANIZATION_ID_REQUIRED'}};
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(organizationId)}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {statusCode:200,body:{skipped:true,reason:'EMERGENCY_STOP'}};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.PENDING&select=id,project_id,title,description,task_type,priority&limit=50`);
 const results=[];
 for(const task of tasks||[]){
  const agent=AGENT_BY_TYPE[task.task_type]||'operations';
  const updated=await supabaseRequest(`tasks?id=eq.${encodeURIComponent(task.id)}&organization_id=eq.${encodeURIComponent(organizationId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'QUEUED',metadata:{agent,dispatch_mode:'AUTONOMOUS',dispatched_at:new Date().toISOString()}})});
  if(updated!==undefined)results.push({task_id:task.id,agent,status:'QUEUED'});
 }
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:organizationId,event_type:'AI_TASKS_DISPATCHED',source:'ai-task-agent-dispatcher',payload:{count:results.length,results}})});
 return {statusCode:200,body:{ok:true,dispatched:results.length,results}};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const r=await dispatch(event);return json(r.statusCode,r.body);}catch(e){console.error(e);return json(500,{error:'AI_TASK_DISPATCH_FAILED',message:e.message});}};
module.exports.dispatch=dispatch;
