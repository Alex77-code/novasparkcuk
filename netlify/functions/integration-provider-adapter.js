const { json, supabaseRequest, verifyUser } = require('./_nova');

const PROVIDERS=new Set(['GOOGLE','META','EMAIL','WHATSAPP','ANALYTICS']);
const ACTIONS=new Set(['CAPABILITIES','PREPARE']);
const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS']);

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),provider=String(body.provider||'').toUpperCase(),action=String(body.action||'CAPABILITIES').toUpperCase();
 if(!org||!PROVIDERS.has(provider)||!ACTIONS.has(action))return json(400,{error:'INVALID_INTEGRATION_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'INTEGRATION_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const capabilities={GOOGLE:['SEARCH_CONSOLE','ADS','BUSINESS_PROFILE'],META:['PAGES','ADS','INSTAGRAM'],EMAIL:['SEND','TEMPLATES','DELIVERY_STATUS'],WHATSAPP:['MESSAGING','TEMPLATES','DELIVERY_STATUS'],ANALYTICS:['REPORTING','CONVERSIONS','TRAFFIC']};
 if(action==='CAPABILITIES')return json(200,{ok:true,provider,capabilities:capabilities[provider],credential_mode:'OAUTH_OR_PROVIDER_SECRET',execution:'ADAPTER_REQUIRED'});
 const connectionId=String(body.connection_id||'').trim();if(!connectionId)return json(400,{error:'CONNECTION_ID_REQUIRED'});
 const rows=await supabaseRequest(`integration_connections?id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,provider,status&limit=1`);const connection=rows?.[0];if(!connection)return json(404,{error:'CONNECTION_NOT_FOUND'});if(String(connection.provider).toUpperCase()!==provider)return json(400,{error:'PROVIDER_MISMATCH'});if(connection.status!=='CONNECTED')return json(409,{error:'INTEGRATION_NOT_CONNECTED'});
 return json(200,{ok:true,prepared:true,provider,connection_id:connectionId,execution:'BLOCKED_UNTIL_PROVIDER_ADAPTER_CONFIGURED',secrets_exposed:false,external_action:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'PROVIDER_ADAPTER_FAILED'})}};
module.exports.run=run;
