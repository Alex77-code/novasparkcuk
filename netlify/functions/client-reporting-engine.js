const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();const projectId=String(body.project_id||'').trim();if(!org||!projectId)return json(400,{error:'ORGANIZATION_AND_PROJECT_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,task_type,title,metadata&limit=200`);
 const total=(tasks||[]).length,completed=(tasks||[]).filter(t=>t.status==='COMPLETED').length,failed=(tasks||[]).filter(t=>t.status==='FAILED').length,pending=total-completed-failed;
 const report={project:{id:project.id,name:project.name,status:project.status},delivery:{total_tasks:total,completed,failed,pending,completion_rate:total?Math.round(completed/total*100):0},generated_at:new Date().toISOString(),recommendations:failed?['Review failed deliverables before client delivery.']:pending?['Continue execution and QA for pending deliverables.']:['Prepare client-ready delivery and next-period recommendations.']};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_REPORT_GENERATED',source:'client-reporting-engine',payload:report})});
 return json(200,{ok:true,report});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_REPORTING_FAILED',message:e.message});}};
module.exports.run=run;
