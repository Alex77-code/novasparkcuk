const { json, supabaseRequest, verifyUser } = require('./_nova');

function evaluate(task){
 const output=task.outputs||task.result;
 if(!output)return {passed:false,reason:'NO_OUTPUT'};
 if(task.status!=='WAITING_QA')return {passed:false,reason:'INVALID_QA_STATE'};
 return {passed:true,reason:'OUTPUT_PRESENT',checks:['execution_result_present','task_state_valid']};
}
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.WAITING_QA&select=id,title,status,outputs,result,retries,max_retries,metadata&limit=50`);const results=[];
 for(const task of tasks||[]){const qa=evaluate(task);const now=new Date().toISOString();const next=qa.passed?'COMPLETED':'FAILED';await supabaseRequest(`tasks?id=eq.${encodeURIComponent(task.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:next,metadata:{...(task.metadata||{}),qa:{...qa,checked_at:now}},updated_at:now})});results.push({task_id:task.id,status:next,qa});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'TASK_QA_COMPLETED',source:'task-qa-engine',payload:{count:results.length,results}})});return json(200,{ok:true,checked:results.length,results});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'TASK_QA_FAILED',message:e.message});}};
module.exports.run=run;
