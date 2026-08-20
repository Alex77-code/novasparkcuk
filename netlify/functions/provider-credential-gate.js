const { json, supabaseRequest, verifyUser } = require('./_nova');

const PROVIDERS=new Set(['OPENAI','INTERNAL']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),provider=String(body.provider||'').toUpperCase();
 if(!org||!PROVIDERS.has(provider))return json(400,{error:'INVALID_PROVIDER'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const configured=Boolean(process.env[`${provider}_API_KEY`]);
 return json(200,{ok:true,provider,configured,secret_source:'RUNTIME_ENVIRONMENT',secret_exposed:false,next:configured?'PROVIDER_READY':'CONFIGURE_RUNTIME_SECRET'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PROVIDER_CREDENTIAL_GATE_FAILED'});}};
module.exports.run=run;
