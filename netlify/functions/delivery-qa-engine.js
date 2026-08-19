const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runDeliveryQA(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.WAITING_QA&select=*&limit=100`);
 const results=[];
 for(const task of tasks||[]){
   const output=task.outputs||{};
   const checks=[];
   checks.push({name:'has_output',passed:Boolean(output.content||output.artifact||output.summary)});
   checks.push({name:'has_agent',passed:Boolean(task.inputs?.agent)});
   checks.push({name:'has_project',passed:Boolean(task.inputs?.project_id)});
   const passed=checks.every(c=>c.passed);
   const now=new Date().toISOString();
   await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:passed?'QA_PASSED':'QA_FAILED',outputs:{...(output||{}),qa:{passed,checks,checked_at:now}},updated_at:now})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:passed?'DELIVERY_QA_PASSED':'DELIVERY_QA_FAILED',source:'delivery-qa-engine',payload:{task_id:task.id,checks}})});
   results.push({task_id:task.id,status:passed?'QA_PASSED':'QA_FAILED',checks});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'DELIVERY_QA_RUN',resource_type:'tasks',metadata:{processed:results.length,passed:results.filter(r=>r.status==='QA_PASSED').length,failed:results.filter(r=>r.status==='QA_FAILED').length}})});
 return {ok:true,processed:results.length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runDeliveryQA());}catch(e){console.error(e);return json(500,{error:'DELIVERY_QA_FAILED',message:e.message});}};
module.exports.runDeliveryQA=runDeliveryQA;
