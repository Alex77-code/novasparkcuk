const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHECKS = {
  SEO: ['Has measurable SEO acceptance criteria','No fabricated rankings or traffic claims'],
  CONTENT: ['Matches approved brief','No fabricated facts, testimonials or results'],
  SOCIAL: ['Brand/brief alignment','No unsupported performance claims'],
  PAID_ADS: ['Budget and targeting require approval','Claims and destination require review'],
  WEBSITE: ['Functional acceptance criteria defined','No client-facing release without approval'],
  ANALYTICS: ['Metrics have a stated source','Calculations are reproducible'],
  BRANDING: ['Matches approved brand brief','Assets are reviewable before release'],
  VIDEO: ['Brief and deliverables match','Final publication requires approval']
};

async function runDeliveryQA(){
 const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const projects=await supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&status=eq.IN_PROGRESS&select=*&order=updated_at.desc&limit=50`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=in.(COMPLETED,FAILED,WAITING_APPROVAL)&select=*&limit=500`);
 const results=[];
 for(const project of projects||[]){
   const projectTasks=(tasks||[]).filter(t=>t.delivery_project_id===project.id);
   if(!projectTasks.length) continue;
   const failures=projectTasks.filter(t=>t.status==='FAILED').length;
   const waiting=projectTasks.filter(t=>t.status==='WAITING_APPROVAL').length;
   const missing=projectTasks.filter(t=>!t.description || !t.inputs?.service).length;
   const passed=failures===0 && missing===0;
   const qa={passed,failures,waiting_approval:waiting,missing_acceptance_context:missing,checks:projectTasks.map(t=>({task_id:t.id,status:t.status,service:t.inputs?.service||'UNKNOWN',criteria:CHECKS[String(t.inputs?.service||'').toUpperCase()]||['Review against approved project brief']}))};
   await supabaseRequest(`delivery_projects?id=eq.${project.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({qa_status:passed?'PASSED':'FAILED',owner_review_status:passed?'PENDING':'NOT_READY',updated_at:new Date().toISOString()})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:passed?'DELIVERY_QA_PASSED':'DELIVERY_QA_FAILED',source:'delivery-qa',payload:{project_id:project.id,qa}})});
   results.push({project_id:project.id,...qa});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_COO',action:'DELIVERY_QA_SCAN',resource_type:'delivery_projects',metadata:{projects_scanned:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length}})});
 return {ok:true,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runDeliveryQA());}catch(e){console.error(e);return json(500,{error:'DELIVERY_QA_FAILED',message:e.message});}};
module.exports.runDeliveryQA=runDeliveryQA;
