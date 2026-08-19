const { json, supabaseRequest, verifyUser } = require('./_nova');

const SERVICE_MAP={SEO:'SEO',CONTENT:'CONTENT',SOCIAL:'CONTENT',PAID_ADS:'CMO',WEBSITE:'DELIVERY',ANALYTICS:'ANALYTICS'};

async function activateDelivery(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const projects=await supabaseRequest(`client_projects?organization_id=eq.${org.id}&status=eq.ONBOARDING&select=*&limit=100`);
 const created=[];
 for(const project of projects||[]){
   const serviceNames=Array.isArray(project.services)&&project.services.length?project.services:Object.keys(SERVICE_MAP);
   for(const service of serviceNames){
     const agent=SERVICE_MAP[String(service).toUpperCase()]||'DELIVERY';
     const existing=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,inputs&limit=2000`);
     if((existing||[]).some(t=>t.inputs?.project_id===project.id&&t.inputs?.service===service&&!['FAILED','CANCELLED'].includes(t.status))) continue;
     const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Deliver ${service} for project ${project.id}`,description:`Execute the approved client ${service} scope only. Produce reviewable work artifacts, document assumptions and evidence, and do not publish or make irreversible external changes without the required approval.`,status:'QUEUED',priority:90,approval_required:['CMO'].includes(agent),inputs:{agent,action_type:'CLIENT_DELIVERY',project_id:project.id,service,qa_required:true}})}))?.[0];
     if(task){created.push(task.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'DELIVERY_TASK_CREATED',source:'client-delivery-engine',payload:{project_id:project.id,service,task_id:task.id,agent}})});}
   }
   await supabaseRequest(`client_projects?id=eq.${project.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ACTIVE_DELIVERY',updated_at:new Date().toISOString()})});
 }
 return {ok:true,projects_processed:(projects||[]).length,tasks_created:created.length,task_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await activateDelivery());}catch(e){console.error(e);return json(500,{error:'CLIENT_DELIVERY_FAILED',message:e.message});}};
module.exports.activateDelivery=activateDelivery;
