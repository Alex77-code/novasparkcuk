const { json, supabaseRequest, verifyUser } = require('./_nova');

const STAGES=new Set(['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST']);
const ROLES=new Set(['OWNER','ADMIN','MANAGER','SALES']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'CRM_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const leadId=String(body.lead_id||'').trim(),name=String(body.name||'').trim(),email=String(body.email||'').trim(),stage=String(body.stage||'NEW').toUpperCase();if(!STAGES.has(stage))return json(400,{error:'INVALID_LEAD_STAGE'});if(!leadId&&!name)return json(400,{error:'LEAD_NAME_REQUIRED'});
 let lead;
 if(leadId){lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,email,company,stage,source,notes&limit=1`))?.[0];if(!lead)return json(404,{error:'LEAD_NOT_FOUND'});
  const patch={stage,updated_at:new Date().toISOString()};for(const k of ['name','email','company','source','notes'])if(body[k]!==undefined)patch[k]=String(body[k]);const rows=await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});lead=rows?.[0]||{...lead,...patch};
 }else{const rows=await supabaseRequest('leads',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,name,email,company:String(body.company||''),stage,source:String(body.source||'DIRECT'),notes:String(body.notes||''),created_by:user.id||null,created_at:new Date().toISOString()})});lead=rows?.[0];}
 if(!lead)return json(500,{error:'LEAD_SAVE_FAILED'});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:leadId?'CRM_LEAD_UPDATED':'CRM_LEAD_CREATED',source:'crm-lead-management-engine',payload:{lead_id:lead.id,stage:lead.stage,company:lead.company||''}})});
 return json(200,{ok:true,lead,pipeline_stage:lead.stage,conversion_ready:lead.stage==='WON'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CRM_LEAD_ENGINE_FAILED'});}};
module.exports.run=run;
