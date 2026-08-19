const { json, supabaseRequest, verifyUser } = require('./_nova');

const SAFE_AGENTS=new Set(['PROSPECTOR','LEADGEN','CONTENT','SEO','SALES','ANALYTICS','CMO','DELIVERY']);

async function runWorker(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const queued=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.QUEUED&select=*&order=priority.desc,created_at.asc&limit=10`);
 const started=[];
 for(const task of queued||[]){
   const agent=String(task.inputs?.agent||'').toUpperCase();
   if(!SAFE_AGENTS.has(agent)) continue;
   if(task.approval_required){
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'WAITING_APPROVAL',updated_at:new Date().toISOString()})});
     continue;
   }
   await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'IN_PROGRESS',started_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'AGENT_TASK_STARTED',source:'task-worker',payload:{task_id:task.id,agent,attempt:1}})});
   started.push({task_id:task.id,agent});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'TASK_WORKER_RUN',resource_type:'tasks',metadata:{queued:(queued||[]).length,started:started.length}})});
 return {ok:true,queued:(queued||[]).length,started};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runWorker());}catch(e){console.error(e);return json(500,{error:'TASK_WORKER_FAILED',message:e.message});}};
module.exports.runWorker=runWorker;
