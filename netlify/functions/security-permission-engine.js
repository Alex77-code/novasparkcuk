const { json, supabaseRequest, verifyUser } = require('./_nova');

const ACTIONS=new Set(['TASK_RUN','TASK_ASSIGN','QA_REVIEW','APPROVE','PUBLISH','NOTIFY','SYSTEM_CONTROL','ADMIN']);
const DEFAULT_ROLES={OWNER:['TASK_RUN','TASK_ASSIGN','QA_REVIEW','APPROVE','PUBLISH','NOTIFY','SYSTEM_CONTROL','ADMIN'],ADMIN:['TASK_RUN','TASK_ASSIGN','QA_REVIEW','APPROVE','PUBLISH','NOTIFY','SYSTEM_CONTROL'],MANAGER:['TASK_RUN','TASK_ASSIGN','QA_REVIEW','APPROVE','PUBLISH','NOTIFY'],OPERATOR:['TASK_RUN','TASK_ASSIGN','QA_REVIEW','NOTIFY'],VIEWER:['NOTIFY']};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'').toUpperCase(),targetRole=String(body.role||'').toUpperCase();
 if(!org||!ACTIONS.has(action))return json(400,{error:'INVALID_PERMISSION_REQUEST'});
 const allowedOrg=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowedOrg)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);
 const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();const permissions=DEFAULT_ROLES[role]||DEFAULT_ROLES.VIEWER;
 if(targetRole&&targetRole!==role)return json(200,{ok:true,organization_id:org,role:targetRole,action,allowed:(DEFAULT_ROLES[targetRole]||[]).includes(action)});
 const isAllowed=permissions.includes(action);
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PERMISSION_CHECKED',source:'security-permission-engine',payload:{user_id:user.id||null,role,action,allowed:isAllowed}})});
 return json(isAllowed?200:403,{ok:isAllowed,organization_id:org,role,action,allowed:isAllowed});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SECURITY_PERMISSION_ENGINE_FAILED'});}};
module.exports.run=run;
