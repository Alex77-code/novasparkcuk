const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','CLIENT_SUCCESS','ANALYST','CREATIVE']);
const ACTIONS=new Set(['STORE','SEARCH','UPDATE','LIST']);
const TYPES=new Set(['CLIENT','PROJECT','BRAND','CAMPAIGN','DECISION','DOCUMENT','NOTE']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'SEARCH').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'MEMORY_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='STORE'||action==='UPDATE'){
  const type=String(body.type||'NOTE').toUpperCase(),title=String(body.title||'').trim(),content=String(body.content||'').trim();if(!TYPES.has(type)||!title||!content)return json(400,{error:'TYPE_TITLE_CONTENT_REQUIRED'});
  const data={organization_id:org,type,title,content,client_id:body.client_id||null,project_id:body.project_id||null,tags:Array.isArray(body.tags)?body.tags:[],source:String(body.source||'AI_CEO'),importance:String(body.importance||'NORMAL').toUpperCase(),updated_by:user.id||null,updated_at:new Date().toISOString()};
  const url=action==='UPDATE'&&body.id?`knowledge_memory?id=eq.${encodeURIComponent(body.id)}&organization_id=eq.${encodeURIComponent(org)}`:'knowledge_memory';const rows=await supabaseRequest(url,{method:action==='UPDATE'?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(data)});return json(200,{ok:true,memory:rows?.[0]||null});
 }
 let q=String(body.query||'').trim();let url=`knowledge_memory?organization_id=eq.${encodeURIComponent(org)}&select=id,type,title,content,client_id,project_id,tags,importance,updated_at&order=updated_at.desc&limit=${Math.min(Number(body.limit||50),100)}`;if(body.type)url+=`&type=eq.${encodeURIComponent(String(body.type).toUpperCase())}`;const rows=await supabaseRequest(url);let memories=rows||[];if(q){const needle=q.toLowerCase();memories=memories.filter(m=>`${m.title} ${m.content} ${(m.tags||[]).join(' ')}`.toLowerCase().includes(needle));}return json(200,{ok:true,query:q,memories});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'KNOWLEDGE_MEMORY_ENGINE_FAILED'});}};
module.exports.run=run;
