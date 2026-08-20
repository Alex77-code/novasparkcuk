const { json, supabaseRequest, verifyUser } = require('./_nova');

function review(task){
 const title=String(task.title||'');
 const checks={has_title:title.length>3,has_project:Boolean(task.project_id),valid_status:['IN_PROGRESS','COMPLETED'].includes(task.status)};
 const passed=Object.values(checks).every(Boolean);
 return {score:passed?100:60,decision:passed?'PASS':'REWORK',checks};
}
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.COMPLETED&task_type=eq.CLIENT_DELIVERY&select=id,project_id,title,status&limit=50`);const results=[];
 for(const task of tasks||[]){const r=review(task);const next=r.decision==='PASS'?'QA_APPROVED':'REWORK_REQUIRED';await supabaseRequest(`tasks?id=eq.${encodeURIComponent(task.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({qa_status:next,qa_score:r.score,qa_reviewed_at:new Date().toISOString()})});results.push({task_id:task.id,...r,next_status:next});}
 if(results.length)await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AUTONOMOUS_QA_COMPLETED',source:'autonomous-qa-review-engine',payload:{count:results.length,results}})});
 return json(200,{ok:true,reviewed:results.length,results,client_approval_gate:'REQUIRED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AUTONOMOUS_QA_FAILED',message:e.message});}};
module.exports.run=run;
