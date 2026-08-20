const { json, supabaseRequest, verifyUser } = require('./_nova');

const CHANNELS=new Set(['email','whatsapp']);
const EVENTS={WELCOME_SENT:'WELCOME_CLIENT',CONTRACT_PENDING:'REQUEST_CONTRACT',BRAND_ASSETS_PENDING:'REQUEST_BRAND_ASSETS',ACCESS_REQUEST_PENDING:'REQUEST_ACCESS',GOALS_PENDING:'REQUEST_GOALS',KICKOFF_PENDING:'SCHEDULE_KICKOFF'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),projectId=String(body.project_id||'').trim(),channel=String(body.channel||'email').toLowerCase();
 if(!org||!projectId||!CHANNELS.has(channel))return json(400,{error:'INVALID_COMMUNICATION_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const checklist=(await supabaseRequest(`onboarding_checklists?organization_id=eq.${encodeURIComponent(org)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,items,status&limit=1`))?.[0];if(!checklist)return json(404,{error:'ONBOARDING_CHECKLIST_NOT_FOUND'});
 const pending=(checklist.items||[]).filter(x=>x.status==='PENDING');
 const messages=pending.map(x=>({template:EVENTS[x.key]||'ONBOARDING_UPDATE',channel,project_id:projectId,status:'PLANNED',requires_consent:true}));
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_COMMUNICATION_PLAN_CREATED',source:'client-communication-engine',payload:{project_id:projectId,channel,messages_count:messages.length}})});
 return json(200,{ok:true,project_id:projectId,channel,messages,external_messages_sent:false,requires_provider_and_consent:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_COMMUNICATION_FAILED',message:e.message});}};
module.exports.run=run;
