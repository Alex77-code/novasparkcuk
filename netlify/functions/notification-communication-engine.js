const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','CLIENT_SUCCESS','MARKETING']);
const CHANNELS=new Set(['EMAIL','WHATSAPP','SLACK','IN_APP']);
const TYPES=new Set(['ALERT','CLIENT_UPDATE','TEAM_UPDATE','REPORT','APPROVAL_REQUEST']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'NOTIFICATION_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const channel=String(body.channel||'IN_APP').toUpperCase(),type=String(body.type||'ALERT').toUpperCase();if(!CHANNELS.has(channel))return json(400,{error:'INVALID_CHANNEL'});if(!TYPES.has(type))return json(400,{error:'INVALID_NOTIFICATION_TYPE'});
 const message=String(body.message||'').trim();if(!message)return json(400,{error:'MESSAGE_REQUIRED'});
 const payload={channel,type,recipient:String(body.recipient||''),subject:String(body.subject||''),message,priority:String(body.priority||'NORMAL').toUpperCase(),send_mode:'QUEUED',external_send:false,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('notification_queue',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,...payload,status:'QUEUED',created_by:user.id||null})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'NOTIFICATION_QUEUED',source:'notification-communication-engine',payload:{notification_id:rows?.[0]?.id||null,channel,type,priority:payload.priority}})});
 return json(200,{ok:true,notification:rows?.[0]||payload,next_step:'CONNECT_CHANNEL_PROVIDERS_AND_DELIVERY_WORKER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'NOTIFICATION_ENGINE_FAILED'});}};
module.exports.run=run;
