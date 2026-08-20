const { json, supabaseRequest, verifyUser } = require('./_nova');

const RULES={SEO:['keywords','meta','technical','links'],CONTENT:['readability','brand','facts','cta'],SOCIAL_MEDIA:['platform','brand','engagement','cta'],ADS:['tracking','copy','policy','landing_page'],WEBSITE:['responsive','accessibility','links','functional'],EMAIL:['subject','content','links','unsubscribe'],ANALYTICS:['tracking','kpis','data','report']};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),service=String(body.service_type||'').toUpperCase();
 if(!org||!taskId||!RULES[service])return json(400,{error:'INVALID_SERVICE_QA_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,outputs&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 if(task.status!=='WAITING_QA')return json(409,{error:'TASK_NOT_READY_FOR_QA',status:task.status});
 const supplied=body.checks&&typeof body.checks==='object'?body.checks:{};const checks={};for(const rule of RULES[service])checks[rule]=supplied[rule]!==false;
 const passed=Object.values(checks).every(Boolean),score=Math.round(Object.values(checks).filter(Boolean).length/Object.keys(checks).length*100);const qaStatus=passed?'QA_APPROVED':'QA_FAILED';
 await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({qa_status:qaStatus,status:passed?'COMPLETED':'QA_FAILED',qa_result:{service_type:service,checks,score,reviewed_at:new Date().toISOString(),reviewed_by:user.id||null}})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SERVICE_SPECIFIC_QA_COMPLETED',source:'service-specific-qa-engine',payload:{task_id:taskId,service_type:service,qa_status:qaStatus,score,checks}})});
 return json(200,{ok:true,task_id:taskId,service_type:service,qa_status:qaStatus,status:passed?'COMPLETED':'QA_FAILED',score,checks,rules:RULES[service]});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SERVICE_QA_FAILED'});}};
module.exports.run=run;
