const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','CLIENT_SUCCESS']);
const STAGES=new Set(['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST']);
const ACTIONS=new Set(['PLAN','SCHEDULE','LIST']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'LIST').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'FOLLOWUP_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='LIST')return json(200,{ok:true,automation:{stages:[...STAGES],actions:['qualify lead','create follow-up','schedule reminder','prepare message','track response'],external_send:'approval_required'}});
 const leadId=String(body.lead_id||'').trim();if(!leadId)return json(400,{error:'LEAD_ID_REQUIRED'});
 const leads=await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,email,company,stage,owner_id&limit=1`);const lead=leads?.[0];if(!lead)return json(404,{error:'LEAD_NOT_FOUND'});
 const stage=String(lead.stage||'NEW').toUpperCase();if(!STAGES.has(stage))return json(400,{error:'INVALID_LEAD_STAGE'});
 const nextAction=stage==='NEW'?'INITIAL_CONTACT':stage==='CONTACTED'?'FOLLOW_UP':stage==='QUALIFIED'?'DISCOVERY_FOLLOW_UP':stage==='PROPOSAL'?'PROPOSAL_FOLLOW_UP':stage==='NEGOTIATION'?'NEGOTIATION_FOLLOW_UP':null;
 if(!nextAction)return json(200,{ok:true,lead,next_action:null,reason:stage});
 const plan={organization_id:org,lead_id:lead.id,type:'SALES_FOLLOWUP',stage,next_action:nextAction,due_at:body.due_at||null,channel:String(body.channel||'EMAIL').toUpperCase(),approval_required:true,status:'PLANNED',created_by:user.id||null,created_at:new Date().toISOString()};
 if(action==='PLAN'){return json(200,{ok:true,followup_plan:plan,external_send:false});}
 if(action==='SCHEDULE'){const rows=await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,title:`${nextAction.replaceAll('_',' ')}: ${lead.name}`,description:`AI sales follow-up for ${lead.company||lead.name}. Channel: ${plan.channel}. External sending requires approval.`,status:'TODO',priority:'HIGH',due_date:plan.due_at,assigned_to:lead.owner_id||user.id||null,created_at:new Date().toISOString()})});await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_SALES_FOLLOWUP_SCHEDULED',source:'ai-sales-followup-engine',payload:{lead_id:lead.id,task_id:rows?.[0]?.id||null,next_action:nextAction,channel:plan.channel}})});return json(200,{ok:true,scheduled:true,task:rows?.[0]||null,approval_required:true});}
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'SALES_FOLLOWUP_ENGINE_FAILED'})}};
module.exports.run=run;
