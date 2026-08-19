const { json, supabaseRequest, verifyUser } = require('./_nova');

async function dispatchAiTasks(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const queued=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.QUEUED&select=*&order=priority.desc,created_at.asc&limit=25`);
 const dispatched=[];
 for(const task of queued||[]){
   if(task.approval_required) continue;
   const agent=String(task.inputs?.agent||'').toUpperCase();
   if(!agent) continue;
   await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'AI_READY',inputs:{...(task.inputs||{}),dispatch_source:'autonomous-dispatcher'},updated_at:new Date().toISOString()})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'AI_TASK_DISPATCHED',source:'ai-task-dispatcher',payload:{task_id:task.id,agent}})});
   dispatched.push({task_id:task.id,agent});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'DISPATCH_AI_TASKS',resource_type:'tasks',metadata:{scanned:(queued||[]).length,dispatched:dispatched.length}})});
 return {ok:true,scanned:(queued||[]).length,dispatched};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await dispatchAiTasks());}catch(e){console.error(e);return json(500,{error:'AI_TASK_DISPATCH_FAILED',message:e.message});}};
module.exports.dispatchAiTasks=dispatchAiTasks;
