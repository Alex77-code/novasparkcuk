const { json, verifyUser } = require('./_nova');

const WINDOW_MS=60_000,MAX_REQUESTS=60;const buckets=new Map();
function securityHeaders(){return {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(),microphone=(),geolocation=()'}}
function rateLimit(key){const now=Date.now(),x=buckets.get(key)||{start:now,count:0};if(now-x.start>=WINDOW_MS){x.start=now;x.count=0}x.count++;buckets.set(key,x);return x.count<=MAX_REQUESTS}
async function run(event){const auth=event.headers.authorization||event.headers.Authorization||'';const user=await verifyUser(auth);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const key=String(user.id||event.headers['x-forwarded-for']||'anonymous');if(!rateLimit(key))return json(429,{error:'RATE_LIMITED',retry_after_seconds:60});const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});return json(200,{ok:true,security:{authenticated:true,authorized:true,rate_limited:true,external_execution_policy:'DENY_BY_DEFAULT',secret_policy:'RUNTIME_ENV_ONLY',security_headers:securityHeaders()}})}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'SECURITY_GATEWAY_FAILED'})}};
module.exports.run=run;
module.exports.securityHeaders=securityHeaders;
