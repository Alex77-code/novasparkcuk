const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runCustomerLifecycle() {
  const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const controls=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(controls?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};

  const won=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&stage=eq.WON&select=*&order=updated_at.desc&limit=25`);
  const projects=await supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&select=*&order=updated_at.desc&limit=50`);
  const created=[];
  for(const deal of won||[]){
    const exists=(projects||[]).find(p=>p.opportunity_id===deal.id && !['COMPLETED','CANCELLED'].includes(p.status));
    if(exists) continue;
    const project=(await supabaseRequest('delivery_projects',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,opportunity_id:deal.id,client_company_id:deal.company_id,name:deal.name,brief:{service:deal.service,commercial_value:deal.amount,currency:deal.currency,next_action:deal.next_action},status:'PLANNED',qa_status:'NOT_RUN',owner_review_status:'NOT_READY'})}))?.[0];
    if(project){created.push(project.id); await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CLIENT_ONBOARDING_STARTED',source:'customer-lifecycle',payload:{opportunity_id:deal.id,delivery_project_id:project.id}})});}
  }
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'CUSTOMER_LIFECYCLE_SYNC',resource_type:'delivery_projects',metadata:{won_deals:(won||[]).length,projects_created:created.length}})});
  return {ok:true,won_deals:(won||[]).length,projects_created:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runCustomerLifecycle());}catch(e){console.error(e);return json(500,{error:'CUSTOMER_LIFECYCLE_FAILED',message:e.message});}};
module.exports.runCustomerLifecycle=runCustomerLifecycle;
