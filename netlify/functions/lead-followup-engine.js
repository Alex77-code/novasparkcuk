const { json, supabaseRequest, verifyUser } = require('./_nova');

const ACTIONS={NEW:'QUALIFY_LEAD',QUALIFIED:'PREPARE_PROPOSAL',PROPOSAL:'FOLLOW_UP',WON:'START_ONBOARDING',LOST:'NURTURE_OR_ARCHIVE'};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const leads=await supabaseRequest(`leads?organization_id=eq.${encodeURIComponent(org)}&select=id,status,source&limit=200`);const actions=[];
 for(const lead of leads||[]){const status=String(lead.status||'NEW').toUpperCase();const next=ACTIONS[status]||'QUALIFY_LEAD';actions.push({lead_id:lead.id,status,next_action:next});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'LEAD_FOLLOWUP_PLAN_GENERATED',source:'lead-followup-engine',payload:{count:actions.length,actions}})});
 return json(200,{ok:true,planned:actions.length,actions,automation:{messages_not_sent:true,requires_provider_and_consent:true}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'LEAD_FOLLOWUP_ENGINE_FAILED'});}};
module.exports.run=run;
