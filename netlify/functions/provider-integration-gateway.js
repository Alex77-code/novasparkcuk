const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS']);
const PROVIDERS={GOOGLE_ADS:{mode:'EXTERNAL_WRITE',secret_env:'GOOGLE_ADS_CREDENTIALS'},META_ADS:{mode:'EXTERNAL_WRITE',secret_env:'META_ADS_CREDENTIALS'},EMAIL:{mode:'EXTERNAL_WRITE',secret_env:'EMAIL_PROVIDER_CREDENTIALS'},WHATSAPP:{mode:'EXTERNAL_WRITE',secret_env:'WHATSAPP_PROVIDER_CREDENTIALS'},SOCIAL_PUBLISH:{mode:'EXTERNAL_WRITE',secret_env:'SOCIAL_PROVIDER_CREDENTIALS'},ANALYTICS:{mode:'READ_ONLY',secret_env:'ANALYTICS_CREDENTIALS'},SEARCH_CONSOLE:{mode:'READ_ONLY',secret_env:'SEARCH_CONSOLE_CREDENTIALS'},BILLING:{mode:'EXTERNAL_WRITE',secret_env:'BILLING_PROVIDER_CREDENTIALS'}};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),provider=String(body.provider||'').toUpperCase(),action=String(body.action||'STATUS').toUpperCase();if(!org||!PROVIDERS[provider])return json(400,{error:'ORGANIZATION_AND_SUPPORTED_PROVIDER_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'PROVIDER_GATEWAY_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const configured=Boolean(process.env[PROVIDERS[provider].secret_env]);
 if(action==='STATUS')return json(200,{ok:true,provider,mode:PROVIDERS[provider].mode,configured,enabled:false,external_execution:false,secret_env:PROVIDERS[provider].secret_env});
 if(action==='CONNECT_REQUEST'){const rows=await supabaseRequest('provider_connection_requests',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,provider,status:'PENDING',requested_by:user.id||null,created_at:new Date().toISOString()})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PROVIDER_CONNECTION_REQUESTED',source:'provider-integration-gateway',payload:{provider,request_id:rows?.[0]?.id||null}})});return json(200,{ok:true,request:rows?.[0]||null,next_step:'STORE_PROVIDER_SECRET_IN_SECURE_RUNTIME_AND_RUN_PROVIDER_HEALTHCHECK'});}
 return json(403,{error:'PROVIDER_EXECUTION_DISABLED',reason:'This gateway does not expose provider credentials or perform external writes until an approved adapter and execution worker are configured'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PROVIDER_GATEWAY_FAILED'});}};
module.exports.run=run;
