const { json, supabaseRequest, verifyUser } = require('./_nova');

async function processConfirmedPayments(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const payments=await supabaseRequest(`payments?organization_id=eq.${org.id}&status=eq.PAID&select=*&limit=100`);
 const projects=await supabaseRequest(`client_projects?organization_id=eq.${org.id}&select=payment_id,status&limit=1000`);
 const created=[];
 for(const payment of payments||[]){
   if(projects?.some(p=>p.payment_id===payment.id)) continue;
   if(!payment.client_id) continue;
   const project=(await supabaseRequest('client_projects',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,client_id:payment.client_id,payment_id:payment.id,status:'ONBOARDING',source:'AUTONOMOUS_PAYMENT_ENGINE',notes:'Created only from confirmed PAID payment. Client requirements must be verified before delivery starts.'})}))?.[0];
   if(!project) continue;
   const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Client onboarding ${project.id}`,description:'Collect and verify client brief, access requirements, scope, deadlines and success criteria. Do not request or store unnecessary secrets.',status:'QUEUED',priority:95,approval_required:false,inputs:{agent:'DELIVERY',action_type:'CLIENT_ONBOARDING',project_id:project.id,payment_id:payment.id}})}))?.[0];
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CLIENT_ONBOARDING_STARTED',source:'payment-onboarding-engine',payload:{payment_id:payment.id,project_id:project.id,task_id:task?.id||null}})});
   created.push({payment_id:payment.id,project_id:project.id,task_id:task?.id||null});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CFO',action:'PROCESS_CONFIRMED_PAYMENTS',resource_type:'client_projects',metadata:{paid_payments:(payments||[]).length,projects_created:created.length}})});
 return {ok:true,paid_payments:(payments||[]).length,projects_created:created.length,projects:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await processConfirmedPayments());}catch(e){console.error(e);return json(500,{error:'PAYMENT_ONBOARDING_FAILED',message:e.message});}};
module.exports.processConfirmedPayments=processConfirmedPayments;
