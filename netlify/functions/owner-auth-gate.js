const { json, supabaseRequest, verifyUser } = require('./_nova');
const OWNER_EMAIL='novasparkcreative@gmail.com';
const OWNER_ROLES=new Set(['OWNER','ADMIN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 if(String(user.email||'').toLowerCase()!==OWNER_EMAIL)return json(403,{error:'OWNER_EMAIL_NOT_ALLOWED'});
 const body=JSON.parse(event.body||'{}');let org=String(body.organization_id||'').trim();
 let memberships=await supabaseRequest(`organization_members?user_id=eq.${encodeURIComponent(user.id||'')}&select=organization_id,role,status&limit=20`);
 memberships=(memberships||[]).filter(m=>m.status!=='DISABLED'&&OWNER_ROLES.has(String(m.role||'').toUpperCase()));
 if(org&&!memberships.some(m=>m.organization_id===org))return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 if(!org){if(memberships.length!==1)return json(409,{error:'ORGANIZATION_SELECTION_REQUIRED',organizations:memberships.map(m=>({organization_id:m.organization_id,role:m.role}))});org=memberships[0].organization_id;}
 const membership=memberships.find(m=>m.organization_id===org);if(!membership)return json(403,{error:'OWNER_ACCESS_REQUIRED'});
 return json(200,{ok:true,authorized:true,user_id:user.id,email:OWNER_EMAIL,organization_id:org,role:membership.role,session_policy:'SERVER_VERIFIED',sensitive_actions:'EXPLICIT_APPROVAL_REQUIRED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'OWNER_AUTH_GATE_FAILED'})}};
module.exports.run=run;
