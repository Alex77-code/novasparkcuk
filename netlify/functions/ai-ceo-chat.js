const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES=new Set(['OWNER','ADMIN','MANAGER']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),message=String(body.message||'').trim();if(!org||!message)return json(400,{error:'ORGANIZATION_AND_MESSAGE_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'CEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{ok:true,message:'Emergency Stop is active. I can analyze the business, but execution is paused.',execution_blocked:true});
 const [leads,campaigns,tasks,assets]=await Promise.all([
  supabaseRequest(`leads?organization_id=eq.${encodeURIComponent(org)}&select=id,stage&limit=1000`),
  supabaseRequest(`campaigns?organization_id=eq.${encodeURIComponent(org)}&select=id,status,channel&limit=1000`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,priority&limit=2000`),
  supabaseRequest(`content_assets?organization_id=eq.${encodeURIComponent(org)}&select=id,status,type&limit=1000`)
 ]);
 const context={leads:{total:(leads||[]).length,follow_up:(leads||[]).filter(x=>['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION'].includes(String(x.stage).toUpperCase())).length},campaigns:{total:(campaigns||[]).length,active:(campaigns||[]).filter(x=>String(x.status).toUpperCase()==='ACTIVE').length},tasks:{open:(tasks||[]).filter(x=>!['DONE','COMPLETED','CANCELLED'].includes(String(x.status).toUpperCase())).length,high:(tasks||[]).filter(x=>String(x.priority).toUpperCase()==='HIGH').length},content:{total:(assets||[]).length,review:(assets||[]).filter(x=>['REVIEW','GENERATED'].includes(String(x.status).toUpperCase())).length}};
 const m=message.toLowerCase();const priorities=[];if(context.leads.follow_up)priorities.push(`Follow up with ${context.leads.follow_up} active leads.`);if(context.campaigns.total&&!context.campaigns.active)priorities.push('Review campaign pipeline and activate an approved campaign.');if(context.content.review)priorities.push(`Review ${context.content.review} content assets awaiting review.`);if(context.tasks.high)priorities.push(`Resolve ${context.tasks.high} high-priority operational tasks.`);if(!priorities.length)priorities.push('Review analytics and identify the next measurable growth opportunity.');
 const answer=(m.includes('status')||m.includes('situation')||m.includes('today'))?`Current business status:\n• ${context.leads.total} leads (${context.leads.follow_up} need follow-up)\n• ${context.campaigns.total} campaigns (${context.campaigns.active} active)\n• ${context.tasks.open} open tasks (${context.tasks.high} high priority)\n• ${context.content.total} content assets (${context.content.review} in review)\n\nTop priorities:\n${priorities.map(x=>'• '+x).join('\n')}`:`I’ve reviewed the current operating data. My recommended priorities are:\n${priorities.map(x=>'• '+x).join('\n')}\n\nI will not publish, message customers, spend ad budget, or modify external platforms without the required approval.`;
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_CEO_CHAT',source:'ai-ceo-chat',payload:{message_length:message.length}})});
 return json(200,{ok:true,answer,context,external_actions:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'AI_CEO_CHAT_FAILED'})}};
module.exports.run=run;
