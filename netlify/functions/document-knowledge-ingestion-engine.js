const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','CLIENT_SUCCESS','ANALYST','CREATIVE']);
const TYPES=new Set(['PDF','DOC','DOCX','TXT','MD','BRIEF','CONTRACT','BRAND_GUIDELINE']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'INGESTION_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const type=String(body.type||'TXT').toUpperCase(),name=String(body.name||'').trim(),content=String(body.content||'').trim();if(!TYPES.has(type)||!name||!content)return json(400,{error:'TYPE_NAME_CONTENT_REQUIRED'});
 const chunks=content.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);const doc={organization_id:org,name,type,source:String(body.source||'UPLOAD'),client_id:body.client_id||null,project_id:body.project_id||null,metadata:body.metadata||{},chunk_count:chunks.length,status:'INGESTED',created_by:user.id||null,created_at:new Date().toISOString()};
 const docs=await supabaseRequest('knowledge_documents',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(doc)});const document=docs?.[0];if(!document)return json(500,{error:'DOCUMENT_CREATE_FAILED'});
 const inserted=[];for(let i=0;i<chunks.length;i++){const rows=await supabaseRequest('knowledge_chunks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,document_id:document.id,chunk_index:i,content:chunks[i],metadata:{...doc.metadata,client_id:doc.client_id,project_id:doc.project_id},created_at:new Date().toISOString()})});if(rows?.[0])inserted.push(rows[0]);}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'KNOWLEDGE_DOCUMENT_INGESTED',source:'document-knowledge-ingestion-engine',payload:{document_id:document.id,name,type,chunk_count:inserted.length}})});
 return json(200,{ok:true,document,chunk_count:inserted.length,search_ready:true,next_step:'CONNECT_VECTOR_EMBEDDINGS_FOR_SEMANTIC_SEARCH'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'DOCUMENT_INGESTION_FAILED'});}};
module.exports.run=run;
