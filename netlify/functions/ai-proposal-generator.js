const { json, supabaseRequest, verifyUser } = require('./_nova');

const SERVICES=['SEO','CONTENT','SOCIAL_MEDIA','ADS','WEBSITE','EMAIL','ANALYTICS'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),leadId=String(body.lead_id||'').trim();
 const service=String(body.service_type||'SEO').toUpperCase();
 if(!org||!leadId||!SERVICES.includes(service))return json(400,{error:'INVALID_PROPOSAL_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,company,email,source,status,qualification_score&limit=1`))?.[0];
 if(!lead)return json(404,{error:'LEAD_NOT_FOUND'});
 const proposal={organization_id:org,lead_id:lead.id,title:`NovaSpark ${service.replace('_',' ')} Proposal`,service_type:service,status:'DRAFT',requires_approval:true,created_by:user.id||null,created_at:new Date().toISOString(),summary:{company:lead.company||'Prospect',qualification_score:lead.qualification_score||0,scope:`${service} services tailored to the prospect's requirements`}};
 const rows=await supabaseRequest('proposals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(proposal)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_PROPOSAL_DRAFT_CREATED',source:'ai-proposal-generator',payload:{lead_id:lead.id,proposal_id:rows?.[0]?.id||null,service_type:service,requires_approval:true}})});
 return json(200,{ok:true,proposal_id:rows?.[0]?.id||null,status:'DRAFT',requires_approval:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_PROPOSAL_GENERATION_FAILED',message:e.message});}};
module.exports.run=run;
