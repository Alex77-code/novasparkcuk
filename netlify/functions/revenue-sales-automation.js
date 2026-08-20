const { json, supabaseRequest, verifyUser } = require('./_nova');

const STAGES=['NEW','QUALIFIED','PROPOSAL','WON','LOST'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();const leadId=String(body.lead_id||'').trim();const stage=String(body.stage||'QUALIFIED').toUpperCase();
 if(!org||!leadId||!STAGES.includes(stage))return json(400,{error:'INVALID_SALES_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const leads=await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,status,source&limit=1`);const lead=leads?.[0];if(!lead)return json(404,{error:'LEAD_NOT_FOUND'});
 const opportunity={organization_id:org,lead_id:lead.id,stage,source:lead.source||'UNKNOWN',updated_by:user.id||null,updated_at:new Date().toISOString()};
 const existing=await supabaseRequest(`opportunities?organization_id=eq.${encodeURIComponent(org)}&lead_id=eq.${encodeURIComponent(leadId)}&select=id&limit=1`);
 let result;
 if(existing?.[0]) result=await supabaseRequest(`opportunities?id=eq.${encodeURIComponent(existing[0].id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(opportunity)});
 else result=await supabaseRequest('opportunities',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(opportunity)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SALES_STAGE_UPDATED',source:'revenue-sales-automation',payload:{lead_id:leadId,stage}})});
 return json(200,{ok:true,lead_id:leadId,stage,opportunity:result?.[0]||null,next_action:stage==='QUALIFIED'?'PREPARE_PROPOSAL':stage==='PROPOSAL'?'FOLLOW_UP':stage==='WON'?'START_ONBOARDING':stage==='LOST'?'ARCHIVE_OR_NURTURE':'QUALIFY_LEAD'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'REVENUE_SALES_AUTOMATION_FAILED',message:e.message});}};
module.exports.run=run;
