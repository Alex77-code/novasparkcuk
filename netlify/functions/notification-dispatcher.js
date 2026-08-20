const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['EMAIL','WEBHOOK','IN_APP']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),severity=String(body.severity||'INFO').toUpperCase(),channel=String(body.channel||'IN_APP').toUpperCase();
 if(!org||!CHANNELS.has(channel))return json(400,{error:'INVALID_NOTIFICATION_REQUEST'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop&&severity!=='CRITICAL')return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const notification={organization_id:org,severity,channel,title:String(body.title||'NovaSpark Alert'),message:String(body.message||''),status:'QUEUED',created_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('notifications',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(notification)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'NOTIFICATION_QUEUED',source:'notification-dispatcher',payload:{notification_id:rows?.[0]?.id||null,severity,channel}})});
 return json(200,{ok:true,notification:rows?.[0]||notification,status:'QUEUED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'NOTIFICATION_DISPATCHER_FAILED'});}};
module.exports.run=run;
