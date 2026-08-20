const { json, supabaseRequest, verifyUser } = require('./_nova');

async function onboard(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}'); const leadId=String(body.lead_id||'').trim();
 if(!leadId)return {error:'LEAD_ID_REQUIRED'};
 const lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${org.id}&select=id,company_name,email,website,status&limit=1`))?.[0];
 if(!lead)return {error:'LEAD_NOT_FOUND'};
 if(lead.status!=='WON')return {error:'CLIENT_NOT_WON',status:lead.status};
 const existing=await supabaseRequest(`companies?organization_id=eq.${org.id}&name=eq.${encodeURIComponent(lead.company_name||'')}&select=id,name&limit=1`);
 let company=existing?.[0];
 if(!company){const created=await supabaseRequest('companies',{method:'POST',body:JSON.stringify({organization_id:org.id,name:lead.company_name,email:lead.email||null,website:lead.website||null})});company=created?.[0];}
 const now=new Date().toISOString();
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CLIENT_ONBOARDING_STARTED',source:'won-client-onboarding',payload:{lead_id:lead.id,company_id:company?.id||null,started_at:now}})});
 return {ok:true,lead_id:lead.id,company_id:company?.id||null,status:'ONBOARDING_STARTED'};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await onboard(event);return json(result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'CLIENT_ONBOARDING_FAILED',message:e.message});}};
module.exports.onboard=onboard;
