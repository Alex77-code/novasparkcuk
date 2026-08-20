const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const base=`organization_id=eq.${encodeURIComponent(org)}`;
 const [failedTasks,failedDeliveries,rework,pendingApprovals]=await Promise.all([
  supabaseRequest(`tasks?${base}&status=eq.QA_FAILED&select=id,title,updated_at&order=updated_at.desc&limit=20`),
  supabaseRequest(`deliveries?${base}&status=eq.FAILED&select=id,task_id,channel,error_message,failed_at&order=failed_at.desc&limit=20`),
  supabaseRequest(`tasks?${base}&qa_status=eq.REWORK_REQUIRED&select=id,title,retry_count,updated_at&order=updated_at.desc&limit=20`),
  supabaseRequest(`task_approvals?${base}&status=eq.PENDING&select=id,task_id,approval_type,created_at&order=created_at.asc&limit=20`)
 ]);
 return json(200,{ok:true,alerts:{failed_tasks:failedTasks||[],failed_deliveries:failedDeliveries||[],rework_required:rework||[],pending_approvals:pendingApprovals||[]},generated_at:new Date().toISOString()});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'OPERATIONS_ALERTS_FAILED'});}};
module.exports.run=run;
