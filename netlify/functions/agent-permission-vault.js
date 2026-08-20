const { json, supabaseRequest, verifyUser } = require('./_nova');

const SCOPES={google_ads:['campaign_read','campaign_draft','metrics_read'],meta_ads:['campaign_read','campaign_draft','metrics_read'],analytics:['metrics_read','report_read'],cms:['content_draft','publish_requires_approval'],social:['content_draft','publish_requires_approval']};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),provider=String(body.provider||'').toLowerCase(),requested=Array.isArray(body.scopes)?body.scopes.map(String):[];
 if(!org||!SCOPES[provider])return json(400,{error:'INVALID_ORGANIZATION_OR_PROVIDER'});
 const allowed=SCOPES[provider],granted=requested.filter(s=>allowed.includes(s));
 const denied=requested.filter(s=>!allowed.includes(s));
 const record={organization_id:org,provider,granted_scopes:granted,denied_scopes:denied,credentials_reference:'SERVER_SIDE_ONLY',requested_by:user.id||null,created_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AGENT_PERMISSION_SCOPE_ISSUED',source:'agent-permission-vault',payload:record})});
 return json(200,{ok:true,provider,granted_scopes:granted,denied_scopes:denied,credentials_exposed:false,credentials_reference:'SERVER_SIDE_ONLY'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PERMISSION_VAULT_FAILED'});}};
module.exports.run=run;
