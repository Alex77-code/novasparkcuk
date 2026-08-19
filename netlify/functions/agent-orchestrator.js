const { json, supabaseRequest, verifyUser } = require('./_nova');

const AGENT_CAPABILITIES={PROSPECTOR:['PROSPECTOR','LEADGEN'],SALES:['SALES','CRO'],CFO:['CFO'],DELIVERY:['DELIVERY','SEO','CONTENT'],CMO:['CMO'],ANALYTICS:['ANALYTICS'],QA:['QA']};

function canRun(agent,task){
 const requested=String(task.inputs?.agent||'').toUpperCase();
 return (AGENT_CAPABILITIES[agent]||[]).includes(requested)||requested===agent;
}

async function dispatchTasks(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=in.(QUEUED,AI_READY)&select=*&limit=100`);
 const dispatched=[];
 for(const task of tasks||[]){
   const requested=String(task.inputs?.agent||'').toUpperCase();
   const agent=Object.keys(AGENT_CAPABILITIES).find(a=>canRun(a,task));
   if(!agent) continue;
   if(task.approval_required && task.status==='AI_READY') continue;
   const now=new Date().toISOString();
   await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'RUNNING',assigned_agent:agent,started_at:now,updated_at:now})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'TASK_DISPATCHED',source:'agent-orchestrator',payload:{task_id:task.id,agent,requested_agent:requested}})});
   dispatched.push({task_id:task.id,agent});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'DISPATCH_AI_TASKS',resource_type:'tasks',metadata:{queued:(tasks||[]).length,dispatched:dispatched.length}})});
 return {ok:true,dispatched};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await dispatchTasks());}catch(e){console.error(e);return json(500,{error:'AGENT_ORCHESTRATOR_FAILED',message:e.message});}};
module.exports.dispatchTasks=dispatchTasks;
