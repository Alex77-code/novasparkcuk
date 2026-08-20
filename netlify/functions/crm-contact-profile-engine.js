const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),leadId=String(body.lead_id||'').trim();
 if(!org||!leadId)return json(400,{error:'ORGANIZATION_AND_LEAD_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,company_name,contact_name,email,phone,website,status,source&limit=1`))?.[0];if(!lead)return json(404,{error:'LEAD_NOT_FOUND'});
 const profile={lead_id:lead.id,company:{name:lead.company_name||null,website:lead.website||null},primary_contact:{name:lead.contact_name||null,email:lead.email||null,phone:lead.phone||null},crm_status:lead.status||null,source:lead.source||null};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CRM_CLIENT_PROFILE_ACCESSED',source:'crm-contact-profile-engine',payload:{lead_id:leadId,accessed_by:user.id||null}})});
 return json(200,{ok:true,profile,extensions:{contacts:'LEAD_SOURCE',notes:'DEDICATED_TABLE_REQUIRED',documents:'DEDICATED_TABLE_REQUIRED',communications:'DEDICATED_TABLE_REQUIRED'}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CRM_PROFILE_FAILED'});}};
module.exports.run=run;
