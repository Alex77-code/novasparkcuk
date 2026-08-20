const { json, supabaseRequest, verifyUser } = require('./_nova');

const PROVIDERS={OPENAI:'OPENAI',INTERNAL:'INTERNAL'};
const TOOLS={SEO:['keyword_research','technical_audit','content_qa'],CONTENT:['brief_generation','copy_generation','content_qa'],SOCIAL_MEDIA:['content_calendar','post_generation','engagement_analysis'],ADS:['campaign_plan','ad_copy','performance_analysis'],WEBSITE:['requirements','ux_review','qa'],EMAIL:['campaign_plan','copy_generation','segmentation'],ANALYTICS:['kpi_analysis','report_generation']};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),taskId=String(body.task_id||'').trim(),service=String(body.service_type||'').toUpperCase(),provider=String(body.provider||'INTERNAL').toUpperCase();
 if(!org||!taskId||!TOOLS[service]||!PROVIDERS[provider])return json(400,{error:'INVALID_PROVIDER_TOOL_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,title,status&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});
 const requested=Array.isArray(body.tools)&&body.tools.length?body.tools:TOOLS[service];const tools=requested.filter(t=>TOOLS[service].includes(t));if(!tools.length)return json(400,{error:'NO_ALLOWED_TOOLS'});
 const execution={task_id:taskId,project_id:task.project_id,service_type:service,provider,tools,status:'READY_FOR_PROVIDER_EXECUTION',created_at:new Date().toISOString(),requested_by:user.id||null};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_PROVIDER_TOOL_PLAN_CREATED',source:'ai-provider-tool-execution-engine',payload:execution})});
 return json(200,{ok:true,execution,provider_execution:'NOT_CALLED',next:'CONNECT_PROVIDER_CREDENTIALS_AND_RUN'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_PROVIDER_TOOL_ENGINE_FAILED'});}};
module.exports.run=run;
