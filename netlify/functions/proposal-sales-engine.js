const { json, supabaseRequest, verifyUser } = require('./_nova');

const STAGES=new Set(['QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST']);
const ROLES=new Set(['OWNER','ADMIN','MANAGER','SALES']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),leadId=String(body.lead_id||'').trim();if(!org||!leadId)return json(400,{error:'ORGANIZATION_AND_LEAD_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'SALES_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,email,company,stage&limit=1`))?.[0];if(!lead)return json(404,{error:'LEAD_NOT_FOUND'});
 if(!['QUALIFIED','PROPOSAL','NEGOTIATION','WON'].includes(lead.stage))return json(409,{error:'LEAD_NOT_READY_FOR_PROPOSAL',stage:lead.stage});
 const items=Array.isArray(body.items)?body.items:[];if(!items.length)return json(400,{error:'PROPOSAL_ITEMS_REQUIRED'});
 const total=items.reduce((sum,x)=>sum+Number(x.quantity||1)*Number(x.unit_price||0),0);const currency=String(body.currency||'GBP').toUpperCase();const status=String(body.status||'DRAFT').toUpperCase();
 if(!['DRAFT','SENT','ACCEPTED','DECLINED'].includes(status))return json(400,{error:'INVALID_PROPOSAL_STATUS'});
 const rows=await supabaseRequest('proposals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,lead_id:leadId,title:String(body.title||`NovaSpark Proposal - ${lead.company||lead.name}`),items,total,currency,status,created_by:user.id||null,created_at:new Date().toISOString()})});const proposal=rows?.[0];if(!proposal)return json(500,{error:'PROPOSAL_CREATE_FAILED'});
 if(status==='ACCEPTED'){await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({stage:'WON',updated_at:new Date().toISOString()})});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PROPOSAL_CREATED',source:'proposal-sales-engine',payload:{proposal_id:proposal.id,lead_id:leadId,status,total,currency,converted_to_won:status==='ACCEPTED'}})});
 return json(200,{ok:true,proposal,lead_stage_after:status==='ACCEPTED'?'WON':lead.stage,conversion_ready:status==='ACCEPTED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PROPOSAL_SALES_ENGINE_FAILED'});}};
module.exports.run=run;
