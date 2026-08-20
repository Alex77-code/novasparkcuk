const { json, supabaseRequest, verifyUser } = require('./_nova');

const ALLOWED=['PENDING','QUEUED'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=in.(${ALLOWED.join(',')})&task_type=eq.CLIENT_DELIVERY&select=id,project_id,title,priority,sequence,status&order=sequence.asc&limit=25`);
 const results=[];
 for(const task of tasks||[]){
  await supabaseRequest(`tasks?id=eq.${encodeURIComponent(task.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'IN_PROGRESS',assigned_agent:'NOVA_DELIVERY_AGENT',started_at:new Date().toISOString()})});
  results.push({task_id:task.id,project_id:task.project_id,status:'IN_PROGRESS',agent:'NOVA_DELIVERY_AGENT'});
 }
 if(results.length)await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_DELIVERY_WORK_STARTED',source:'ai-delivery-worker',payload:{count:results.length,results}})});
 return json(200,{ok:true,started:results.length,results,next_gate:'QA_REQUIRED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_DELIVERY_WORKER_FAILED',message:e.message});}};
module.exports.run=run;
