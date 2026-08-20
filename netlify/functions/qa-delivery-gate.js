const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runGate(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.WAITING_QA&select=*&limit=50`);
 const results=[];
 for(const task of tasks||[]){
  const output=task.outputs?.provider_result;
  const passed=Boolean(output)&&typeof output==='object'&&Object.keys(output).length>0;
  const now=new Date().toISOString();
  const status=passed?'COMPLETED':'FAILED';
  await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,completed_at:passed?now:null,updated_at:now,outputs:{...(task.outputs||{}),qa:{passed,checked_at:now}}})});
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:passed?'TASK_QA_PASSED':'TASK_QA_FAILED',source:'qa-delivery-gate',payload:{task_id:task.id,agent:task.assigned_agent,passed}})});
  results.push({task_id:task.id,status});
 }
 return {ok:true,processed:results.length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runGate());}catch(e){console.error(e);return json(500,{error:'QA_GATE_FAILED',message:e.message});}};
module.exports.runGate=runGate;
