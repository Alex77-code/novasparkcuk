const { json, supabaseRequest, verifyUser } = require('./_nova');

const TYPES=new Set(['TASK','AGENT','QA','APPROVAL','DELIVERY','NOTIFICATION','SYSTEM']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),type=String(body.event_type||'SYSTEM').toUpperCase();
 if(!org||!TYPES.has(type))return json(400,{error:'INVALID_EVENT'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop&&body.critical!==true)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const record={organization_id:org,event_type:type,event_name:String(body.event_name||'EVENT'),source:String(body.source||'central-event-bus'),payload:body.payload||{},created_at:new Date().toISOString(),created_by:user.id||null};
 const rows=await supabaseRequest('events',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(record)});
 return json(200,{ok:true,event:rows?.[0]||record,status:'PUBLISHED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CENTRAL_EVENT_BUS_FAILED'});}};
module.exports.run=run;
