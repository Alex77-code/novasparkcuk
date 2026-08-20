const { json, supabaseRequest, verifyUser } = require('./_nova');

const TYPES=new Set(['CONTRACT','BRAND_ASSET','BRIEF','ACCESS','DELIVERABLE','REPORT','OTHER']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),type=String(body.document_type||'OTHER').toUpperCase(),name=String(body.name||'').trim(),storagePath=String(body.storage_path||'').trim();
 if(!org||!projectId||!name||!storagePath||!TYPES.has(type))return json(400,{error:'INVALID_DOCUMENT_ASSET'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const project=(await supabaseRequest(`projects?id=eq.${encodeURIComponent(projectId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name&limit=1`))?.[0];if(!project)return json(404,{error:'PROJECT_NOT_FOUND'});
 const rows=await supabaseRequest('client_assets',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,project_id:projectId,name,document_type:type,storage_path:storagePath,status:'UPLOADED',uploaded_by:user.id||null,created_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_ASSET_REGISTERED',source:'client-document-asset-engine',payload:{project_id:projectId,asset_id:rows?.[0]?.id||null,type,name}})});
 return json(200,{ok:true,asset:rows?.[0]||{project_id:projectId,name,document_type:type,status:'UPLOADED'},storage_provider:'EXTERNAL_STORAGE_REQUIRED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_ASSET_ENGINE_FAILED'});}};
module.exports.run=run;
