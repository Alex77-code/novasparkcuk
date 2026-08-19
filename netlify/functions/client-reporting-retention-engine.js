const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runClientReportingRetention(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const projects=await supabaseRequest(`client_projects?organization_id=eq.${org.id}&status=eq.ACTIVE_DELIVERY&select=*&limit=100`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,inputs,outputs&limit=2000`);
 const created=[];
 for(const project of projects||[]){
   const projectTasks=(tasks||[]).filter(t=>t.inputs?.project_id===project.id);
   const qaPassed=projectTasks.filter(t=>t.status==='QA_PASSED').length;
   const qaFailed=projectTasks.filter(t=>t.status==='QA_FAILED').length;
   const completed=projectTasks.length>0 && projectTasks.every(t=>['QA_PASSED','COMPLETED'].includes(t.status));
   if(!completed) continue;
   const reportExists=projectTasks.some(t=>t.inputs?.action_type==='CLIENT_REPORT' && !['FAILED','CANCELLED'].includes(t.status));
   if(reportExists) continue;
   const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Client performance report ${project.id}`,description:'Prepare a client-facing completion/performance report using verified project outputs and measured KPIs only. Include completed work, evidence, outcomes, limitations, recommendations and renewal opportunities. Never invent results.',status:'AI_READY',priority:85,approval_required:true,inputs:{agent:'ANALYTICS',action_type:'CLIENT_REPORT',project_id:project.id,qa_passed:qaPassed,qa_failed:qaFailed,retention_review_required:true}})}))?.[0];
   if(task){created.push(task.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CLIENT_REPORT_QUEUED',source:'client-reporting-retention-engine',payload:{project_id:project.id,task_id:task.id,qa_passed:qaPassed}})});}
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CCO',action:'CLIENT_REPORTING_RETENTION_SCAN',resource_type:'client_projects',metadata:{active_projects:(projects||[]).length,reports_queued:created.length}})});
 return {ok:true,projects_scanned:(projects||[]).length,reports_queued:created.length,task_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runClientReportingRetention());}catch(e){console.error(e);return json(500,{error:'CLIENT_REPORTING_RETENTION_FAILED',message:e.message});}};
module.exports.runClientReportingRetention=runClientReportingRetention;
