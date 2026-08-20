const { json, supabaseRequest, verifyUser } = require('./_nova');

const AGENTS={SEO:{agent:'NOVA_SEO_AGENT',capabilities:['technical_seo','keyword_research','on_page_optimization','seo_reporting']},CONTENT:{agent:'NOVA_CONTENT_AGENT',capabilities:['content_strategy','copywriting','content_calendar','content_qa']},SOCIAL_MEDIA:{agent:'NOVA_SOCIAL_AGENT',capabilities:['social_strategy','content_creation','publishing_plan','engagement_analysis']},ADS:{agent:'NOVA_ADS_AGENT',capabilities:['campaign_strategy','tracking','ad_copy','performance_optimization']},WEBSITE:{agent:'NOVA_WEB_AGENT',capabilities:['requirements','ux','development','qa']},EMAIL:{agent:'NOVA_EMAIL_AGENT',capabilities:['campaigns','automation','segmentation','reporting']},ANALYTICS:{agent:'NOVA_ANALYTICS_AGENT',capabilities:['tracking','kpi_analysis','dashboards','reporting']}};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),service=String(body.service_type||'').toUpperCase(),taskId=String(body.task_id||'').trim();
 if(!org||!service||!AGENTS[service])return json(400,{error:'INVALID_AGENT_ROUTING_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 if(taskId){const task=(await supabaseRequest(`tasks?id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,project_id,status,title&limit=1`))?.[0];if(!task)return json(404,{error:'TASK_NOT_FOUND'});}
 const selected=AGENTS[service];
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SPECIALIST_AGENT_ROUTED',source:'ai-specialist-agent-router',payload:{task_id:taskId||null,service_type:service,agent:selected.agent,capabilities:selected.capabilities,routed_by:user.id||null}})});
 return json(200,{ok:true,task_id:taskId||null,service_type:service,agent:selected.agent,capabilities:selected.capabilities,execution:'ROUTED_NOT_EXECUTED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SPECIALIST_AGENT_ROUTER_FAILED'});}};
module.exports.run=run;
