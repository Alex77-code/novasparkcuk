const { json, supabaseRequest } = require('./_nova');

const PROVIDERS=new Set(['GOOGLE','META','EMAIL','WHATSAPP','ANALYTICS']);
function safeState(value){return typeof value==='string'&&/^[A-Za-z0-9._:-]{16,512}$/.test(value)}
async function run(event){
 const q=event.queryStringParameters||{};const provider=String(q.provider||'').toUpperCase();const code=String(q.code||'');const state=String(q.state||'');if(!PROVIDERS.has(provider)||!code||!safeState(state))return json(400,{error:'INVALID_OAUTH_CALLBACK'});
 return json(200,{ok:true,status:'CALLBACK_ACCEPTED',provider,state_verified_format:true,token_exchange:'PENDING_PROVIDER_ADAPTER',credential_storage:'SERVER_SIDE_SECRET_STORE_REQUIRED',external_publish:false});
}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'OAUTH_CALLBACK_FAILED'})}};
module.exports.run=run;
