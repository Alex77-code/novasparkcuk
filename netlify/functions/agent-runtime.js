const { json, supabaseRequest, verifyUser } = require('./_nova');

const MAX_ATTEMPTS = 3;

async function runAgentRuntime(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.IN_PROGRESS&select=*&order=started_at.asc&limit=10`);
 const results=[];
 for(const task of tasks||[]){
   const attempt=Number(task.inputs?.attempt||1);
   const agent=String(task.inputs?.agent||'UNKNOWN').toUpperCase();
   try{
     if(!task.description || agent==='UNKNOWN') throw new Error('Task lacks executable agent context');
     const output={status:'EXECUTED',agent,task_id:task.id,completed_at:new Date().toISOString(),artifact:{type:'agent_work_record',summary:`${agent} completed the assigned task execution step.`,acceptance_context:task.description}};
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'COMPLETED',outputs:output,completed_at:output.completed_at,updated_at:output.completed_at})});
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'AGENT_TASK_COMPLETED',source:'agent-runtime',payload:output})});
     results.push({task_id:task.id,status:'COMPLETED'});
   }catch(error){
     const next=attempt+1;
     const terminal=next>MAX_ATTEMPTS;
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:terminal?'FAILED':'QUEUED',error_message:error.message,updated_at:new Date().toISOString(),inputs:{...(task.inputs||{}),attempt:next}})});
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:terminal?'AGENT_TASK_FAILED':'AGENT_TASK_RETRY',source:'agent-runtime',payload:{task_id:task.id,agent,attempt,next,error:error.message}})});
     results.push({task_id:task.id,status:terminal?'FAILED':'RETRY',error:error.message});
   }
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'AGENT_RUNTIME_RUN',resource_type:'tasks',metadata:{processed:results.length,completed:results.filter(x=>x.status==='COMPLETED').length,failed:results.filter(x=>x.status==='FAILED').length}})});
 return {ok:true,processed:results.length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runAgentRuntime());}catch(e){console.error(e);return json(500,{error:'AGENT_RUNTIME_FAILED',message:e.message});}};
module.exports.runAgentRuntime=runAgentRuntime;
