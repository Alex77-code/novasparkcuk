const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS']);
const PROVIDERS=new Set(['GOOGLE','META','EMAIL','WHATSAPP','ANALYTICS']);
const ACTIONS=new Set(['LIST','REQUEST','DISCONNECT']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'LIST').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'INTEGRATION_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='LIST'){const rows=await supabaseRequest(`integration_connections?organization_id=eq.${encodeURIComponent(org)}&select=id,provider,status,scopes,created_at,updated_at&order=created_at.desc&limit=100`);return json(200,{ok:true,connections:rows||[],providers:[...PROVIDERS]});}
 const provider=String(body.provider||'').toUpperCase();if(!PROVIDERS.has(provider))return json(400,{error:'INVALID_PROVIDER'});
 if(action==='REQUEST'){const connection={organization_id:org,provider,status:'OAUTH_REQUIRED',scopes:Array.isArray(body.scopes)?body.scopes:[],requested_by:user.id||null,created_at:new Date().toISOString()};const rows=await supabaseRequest('integration_connections',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(connection)});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'INTEGRATION_CONNECTION_REQUESTED',source:'integration-connection-engine',payload:{provider,connection_id:rows?.[0]?.id||null}})});return json(200,{ok:true,connection:rows?.[0]||connection,oauth_url:null,next_step:'CONNECT_PROVIDER_OAUTH_ADAPTER'});}
 const id=String(body.connection_id||'').trim();if(!id)return json(400,{error:'CONNECTION_ID_REQUIRED'});const rows=await supabaseRequest(`integration_connections?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'DISCONNECTED',updated_at:new Date().toISOString()})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'INTEGRATION_DISCONNECTED',source:'integration-connection-engine',payload:{connection_id:id}})});return json(200,{ok:true,connection:rows?.[0]||null});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'INTEGRATION_ENGINE_FAILED'})}};
module.exports.run=run;
