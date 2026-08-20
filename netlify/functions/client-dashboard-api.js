const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim();
 if(!org||!projectId)return json(400,{error:'ORGANIZATION_AND_PROJECT_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,delivery_service,approval_status&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,qa_status,client_approval_status&limit=500`);
 const reports=await supabaseRequest(`client_reports?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,report,created_at&order=created_at.desc&limit=12`);
 const total=(tasks||[]).length,completed=(tasks||[]).filter(t=>t.status==='COMPLETED').length,qa=(tasks||[]).filter(t=>t.qa_status==='QA_APPROVED').length,approved=(tasks||[]).filter(t=>t.client_approval_status==='CLIENT_APPROVED').length;
 return json(200,{ok:true,project,summary:{tasks_total:total,completed,qa_approved:qa,client_approved:approved,completion_rate:total?Math.round(completed/total*100):0},reports:reports||[],dashboard_generated_at:new Date().toISOString()});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_DASHBOARD_FAILED',message:e.message});}};
module.exports.run=run;
