const { json, supabaseRequest, verifyUser } = require('./_nova');

const OWNER_ROLES=new Set(['OWNER','ADMIN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const org=String((JSON.parse(event.body||'{}')).organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const rows=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role,status&limit=1`);const membership=rows?.[0];const role=String(membership?.role||user.role||'').toUpperCase();
 if(!membership||membership.status==='DISABLED'||!OWNER_ROLES.has(role))return json(403,{error:'OWNER_ACCESS_REQUIRED'});
 return json(200,{ok:true,authorized:true,user_id:user.id,organization_id:org,role,session_policy:'SERVER_VERIFIED',sensitive_actions:'EXPLICIT_APPROVAL_REQUIRED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'OWNER_AUTH_GATE_FAILED'})}};
module.exports.run=run;
