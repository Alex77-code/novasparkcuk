const { json, supabaseRequest, verifyUser } = require('./_nova');

const TASKS={SEO:['Technical SEO audit','Keyword research','On-page optimisation','Monthly SEO report'],CONTENT:['Content strategy','Content calendar','Content production','Content QA'],SOCIAL_MEDIA:['Social strategy','Content calendar','Creative production','Publishing QA'],ADS:['Campaign strategy','Tracking setup','Campaign launch','Performance optimisation'],WEBSITE:['Requirements','Design','Development','QA'],EMAIL:['Audience setup','Campaign design','Automation setup','Performance report'],ANALYTICS:['Tracking audit','Dashboard setup','Conversion tracking','Reporting']};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),service=String(body.service_type||'SEO').toUpperCase();
 if(!org||!projectId||!TASKS[service])return json(400,{error:'INVALID_DELIVERY_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,lead_id&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const existing=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`);if(existing?.length)return json(409,{error:'DELIVERY_TASKS_ALREADY_INITIALIZED',project_id:projectId});
 const tasks=TASKS[service].map((name,i)=>({organization_id:org,project_id:projectId,title:name,status:'PENDING',priority:i===0?'HIGH':'NORMAL',task_type:'CLIENT_DELIVERY',sequence:i+1,created_by:user.id||null,created_at:new Date().toISOString()}));
 const created=await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(tasks)});
 await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ACTIVE',delivery_service:service,delivery_started_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_DELIVERY_INITIALIZED',source:'client-project-delivery-engine',payload:{project_id:projectId,service_type:service,task_count:tasks.length}})});
 return json(200,{ok:true,project_id:projectId,status:'ACTIVE',service_type:service,tasks_created:created?.length||tasks.length,qa_gate:'REQUIRED_BEFORE_CLIENT_APPROVAL'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_DELIVERY_ENGINE_FAILED',message:e.message});}};
module.exports.run=run;
