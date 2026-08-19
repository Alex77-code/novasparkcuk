const { json, supabaseRequest, verifyUser } = require('./_nova');

const SERVICE_AGENTS = {
  SEO: 'SEO', CONTENT: 'CONTENT', SOCIAL: 'CMO', PAID_ADS: 'CMO', WEBSITE: 'DELIVERY', ANALYTICS: 'ANALYTICS', BRANDING: 'CONTENT', VIDEO: 'CONTENT'
};

async function runDeliveryOrchestrator(){
  const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
  const projects=await supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&status=in.(PLANNED,IN_PROGRESS)&select=*&order=created_at.asc&limit=50`);
  const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=*&order=created_at.desc&limit=500`);
  const created=[];
  for(const project of projects||[]){
    const brief=project.brief||{};
    const services=Array.isArray(brief.services)?brief.services:(brief.service?[brief.service]:['ANALYTICS']);
    for(const raw of services){
      const service=String(raw).toUpperCase().replace(/[^A-Z_]/g,'_');
      const agent=SERVICE_AGENTS[service]||'DELIVERY';
      const title=`${service.replace(/_/g,' ')} delivery - ${project.name}`;
      const exists=(tasks||[]).some(t=>t.delivery_project_id===project.id && t.title===title && !['FAILED','CANCELLED'].includes(t.status));
      if(exists) continue;
      const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,delivery_project_id:project.id,title,description:`Execute the approved ${service} work for the client project. Use only verified project brief information. Produce a reviewable artifact and acceptance criteria.`,status:'QUEUED',priority:70,risk:'MEDIUM',approval_required:false,inputs:{agent,service,project_id:project.id}})}))?.[0];
      if(task){created.push(task.id); await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'DELIVERY_TASK_CREATED',source:'delivery-orchestrator',payload:{project_id:project.id,task_id:task.id,agent,service}})});}
    }
    await supabaseRequest(`delivery_projects?id=eq.${project.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'IN_PROGRESS',updated_at:new Date().toISOString()})});
  }
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'DELIVERY_ORCHESTRATION',resource_type:'delivery_projects',metadata:{projects:(projects||[]).length,tasks_created:created.length}})});
  return {ok:true,projects:(projects||[]).length,tasks_created:created.length};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runDeliveryOrchestrator());}catch(e){console.error(e);return json(500,{error:'DELIVERY_ORCHESTRATION_FAILED',message:e.message});}};
module.exports.runDeliveryOrchestrator=runDeliveryOrchestrator;
