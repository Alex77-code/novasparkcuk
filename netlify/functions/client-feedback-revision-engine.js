const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),feedback=String(body.feedback||'').trim();
 if(!org||!projectId||!feedback)return json(400,{error:'ORGANIZATION_PROJECT_FEEDBACK_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const existing=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&status=in.(PENDING,QUEUED,WAITING_QA)&metadata->>revision_for=eq.${encodeURIComponent(projectId)}&select=id&limit=1`);
 if(existing?.length)return json(200,{ok:true,already_queued:true,task_id:existing[0].id});
 const rows=await supabaseRequest('tasks',{method:'POST',body:JSON.stringify({organization_id:org,project_id:projectId,title:'Client feedback revision',description:feedback,status:'PENDING',task_type:'CLIENT_REVISION',priority:'HIGH',metadata:{revision_for:projectId,feedback,created_by:user.id||null,automated:true}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_FEEDBACK_REVISION_CREATED',source:'client-feedback-revision-engine',payload:{project_id:projectId,task_id:rows?.[0]?.id||null,feedback}})});
 return json(200,{ok:true,task_id:rows?.[0]?.id||null,status:'PENDING'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'REVISION_ENGINE_FAILED',message:e.message});}};
module.exports.run=run;
