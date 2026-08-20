const { json, supabaseRequest, verifyUser } = require('./_nova');
const OWNER_EMAIL='novasparkcreative@gmail.com';
const OWNER_ROLES=new Set(['OWNER','ADMIN']);
async function requireOwner(event, organizationId){
 const auth=event.headers.authorization||event.headers.Authorization;
 const user=await verifyUser(auth); if(!user)return {ok:false,response:json(401,{error:'AUTHENTICATION_REQUIRED'})};
 const org=String(organizationId||'').trim(); if(!org)return {ok:false,response:json(400,{error:'ORGANIZATION_ID_REQUIRED'})};
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;
 if(!allowed)return {ok:false,response:json(403,{error:'ORGANIZATION_ACCESS_DENIED'})};
 const rows=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role,status&limit=1`);
 const m=rows?.[0]; const role=String(m?.role||user.role||'').toUpperCase();
 if(!m||m.status==='DISABLED'||!OWNER_ROLES.has(role)||String(user.email||'').toLowerCase()!==OWNER_EMAIL)return {ok:false,response:json(403,{error:'OWNER_ACCESS_REQUIRED'})};
 const controls=await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`);if(controls?.[0]?.emergency_stop)return {ok:false,response:json(423,{error:'EMERGENCY_STOP_ACTIVE'})};
 return {ok:true,user,organizationId:org,role};
}
module.exports={requireOwner,OWNER_EMAIL};