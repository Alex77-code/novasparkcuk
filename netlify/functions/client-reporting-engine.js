const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim();
 if(!org||!projectId)return json(400,{error:'ORGANIZATION_AND_PROJECT_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service,approval_status&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 if(project.approval_status && project.approval_status!=='CLIENT_APPROVED')return json(409,{error:'CLIENT_APPROVAL_REQUIRED',approval_status:project.approval_status});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,qa_status,client_approval_status,title&limit=200`);
 const total=(tasks||[]).length,completed=(tasks||[]).filter(t=>t.status==='COMPLETED').length,failed=(tasks||[]).filter(t=>t.status==='FAILED').length,pending=total-completed-failed,qaApproved=(tasks||[]).filter(t=>t.qa_status==='QA_APPROVED').length,clientApproved=(tasks||[]).filter(t=>t.client_approval_status==='CLIENT_APPROVED').length;
 const report={project:{id:project.id,name:project.name,status:project.status,service:project.delivery_service||null},kpis:{total_tasks:total,completed,failed,pending,qa_approved:qaApproved,client_approved:clientApproved,completion_rate:total?Math.round(completed/total*100):0},generated_at:new Date().toISOString(),recommendations:failed?['Review failed deliverables before the next client cycle.']:pending?['Continue execution and QA for pending deliverables.']:['Prepare the next reporting period and optimisation plan.']};
 const rows=await supabaseRequest('client_reports',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,project_id:projectId,status:'DRAFT',report,created_by:user.id||null,created_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_REPORT_DRAFT_CREATED',source:'client-reporting-engine',payload:{project_id:projectId,report_id:rows?.[0]?.id||null,kpis:report.kpis}})});
 return json(200,{ok:true,report_id:rows?.[0]?.id||null,status:'DRAFT',report});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_REPORTING_FAILED',message:e.message});}};
module.exports.run=run;
