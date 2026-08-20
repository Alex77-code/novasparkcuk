const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim();
 if(!org||!projectId)return json(400,{error:'ORGANIZATION_AND_PROJECT_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,status,lead_id,delivery_service&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const [tasks,reports,events]=await Promise.all([
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,title,status,qa_status,client_approval_status&order=sequence.asc&limit=100`),
  supabaseRequest(`client_reports?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,status,report,created_at&order=created_at.desc&limit=20`),
  supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&limit=50&order=created_at.desc&select=event_type,source,payload,created_at`)
 ]);
 return json(200,{ok:true,workspace:{project,contacts:[],documents:[],notes:[],communications:[],tasks:tasks||[],reports:reports||[],recent_events:events||[]},message:'CRM workspace data assembled; contacts/documents/notes/communications require dedicated tables/providers.'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_WORKSPACE_FAILED'});}};
module.exports.run=run;
