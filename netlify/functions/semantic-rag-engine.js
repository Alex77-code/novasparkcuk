const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','CLIENT_SUCCESS','ANALYST','CREATIVE']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),query=String(body.query||'').trim();if(!org||!query)return json(400,{error:'ORGANIZATION_AND_QUERY_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'RAG_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const limit=Math.min(Math.max(Number(body.limit||8),1),30);const chunks=await supabaseRequest(`knowledge_chunks?organization_id=eq.${encodeURIComponent(org)}&select=id,document_id,chunk_index,content,metadata&order=created_at.desc&limit=500`);
 const terms=query.toLowerCase().split(/\s+/).filter(Boolean);const scored=(chunks||[]).map(c=>{const text=String(c.content||'').toLowerCase();let score=0;for(const term of terms){if(text.includes(term))score+=1;}return {...c,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
 const context=scored.map(x=>({chunk_id:x.id,document_id:x.document_id,content:x.content,score:x.score,metadata:x.metadata}));
 const result={query,context,match_count:context.length,retrieval:'LEXICAL_BASELINE',grounding_required:true,generation:false,external_actions_authorized:false};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'RAG_CONTEXT_RETRIEVED',source:'semantic-rag-engine',payload:{query,match_count:context.length}})});
 return json(200,{ok:true,rag:result,next_step:'CONNECT_EMBEDDING_MODEL_AND_VECTOR_STORE'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'RAG_ENGINE_FAILED'});}};
module.exports.run=run;
