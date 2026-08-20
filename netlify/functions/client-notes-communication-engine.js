const { json, supabaseRequest, verifyUser } = require('./_nova');

const TYPES=new Set(['INTERNAL_NOTE','CLIENT_NOTE','EMAIL','WHATSAPP','CALL','MEETING','FOLLOW_UP']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),type=String(body.type||'INTERNAL_NOTE').toUpperCase(),content=String(body.content||'').trim();
 if(!org||!projectId||!content||!TYPES.has(type))return json(400,{error:'INVALID_NOTE_COMMUNICATION'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const visibility=type==='INTERNAL_NOTE'?'INTERNAL':'CLIENT_VISIBLE';
 const row={organization_id:org,project_id:projectId,type,content,visibility,created_by:user.id||null,created_at:new Date().toISOString()};
 const result=await supabaseRequest('client_communications',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_COMMUNICATION_LOGGED',source:'client-notes-communication-engine',payload:{project_id:projectId,type,visibility,communication_id:result?.[0]?.id||null}})});
 return json(200,{ok:true,communication:result?.[0]||row,delivery:'LOGGED_ONLY',provider_delivery_required:['EMAIL','WHATSAPP'].includes(type)});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_COMMUNICATION_LOG_FAILED'});}};
module.exports.run=run;
