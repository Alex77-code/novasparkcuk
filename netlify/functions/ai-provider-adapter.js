const { json, supabaseRequest, verifyUser } = require('./_nova');

async function callProvider(input){
 const url=process.env.NOVA_AI_WORKER_URL;
 const secret=process.env.NOVA_AI_WORKER_SECRET;
 if(!url||!secret) throw new Error('AI_PROVIDER_NOT_CONFIGURED');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${secret}`},body:JSON.stringify({task_id:input.task_id,agent:input.agent,instructions:input.instructions,context:input.context||{}})});
 if(!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
 return response.json();
}

exports.handler=async event=>{
 if(event.httpMethod!=='POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
 try{
   const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
   const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim();
   if(!org||!taskId)return json(400,{error:'ORGANIZATION_AND_TASK_REQUIRED'});
   const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
   const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
   const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
   if(!['IN_PROGRESS','QUEUED'].includes(task.status))return json(409,{error:'TASK_NOT_EXECUTABLE',status:task.status});
   const result=await callProvider(body);
   await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'WAITING_QA',outputs:{provider_result:result},updated_at:new Date().toISOString()})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_PROVIDER_EXECUTED',source:'ai-provider-adapter',payload:{task_id:taskId,provider_result_stored:true,executed_by:user.id||null}})});
   return json(200,{ok:true,task_id:taskId,status:'WAITING_QA',result});
 }catch(e){console.error(e);return json(502,{error:'AI_PROVIDER_FAILED',message:e.message});}
};
module.exports.callProvider=callProvider;
