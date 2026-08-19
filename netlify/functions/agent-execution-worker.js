const { json, supabaseRequest, verifyUser } = require('./_nova');

const RETRY_LIMIT=3;

async function executeWorker(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.RUNNING&select=*&limit=25`);
 const results=[];
 for(const task of tasks||[]){
   const agent=String(task.assigned_agent||task.inputs?.agent||'').toUpperCase();
   const now=new Date().toISOString();
   const attempts=Number(task.attempts||0)+1;
   const execution={agent,task_id:task.id,started_at:task.started_at||now,attempt:attempts,execution_mode:'ORCHESTRATED',note:'Execution adapter completed the control-plane step. A provider-specific worker must supply real AI/business output.'};
   const providerReady=Boolean(process.env.NOVA_AI_WORKER_URL);
   if(providerReady){
     results.push({task_id:task.id,status:'WAITING_PROVIDER'});
     continue;
   }
   if(attempts>=RETRY_LIMIT){
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FAILED',attempts,outputs:{execution,error:'AI_PROVIDER_NOT_CONFIGURED'},updated_at:now})});
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'TASK_FAILED',source:'agent-execution-worker',payload:{task_id:task.id,agent,reason:'AI_PROVIDER_NOT_CONFIGURED',attempts}})});
     results.push({task_id:task.id,status:'FAILED'});
   } else {
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'WAITING_PROVIDER',attempts,outputs:{execution},updated_at:now})});
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'TASK_WAITING_PROVIDER',source:'agent-execution-worker',payload:{task_id:task.id,agent,attempts}})});
     results.push({task_id:task.id,status:'WAITING_PROVIDER'});
   }
 }
 return {ok:true,processed:results.length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await executeWorker());}catch(e){console.error(e);return json(500,{error:'AGENT_EXECUTION_FAILED',message:e.message});}};
module.exports.executeWorker=executeWorker;
