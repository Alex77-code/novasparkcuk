const { json, supabaseRequest, verifyUser } = require('./_nova');

async function queueApprovedSalesFollowups(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const opps=await supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&status=eq.AWAITING_CLIENT_ACCEPTANCE&select=*&limit=100`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,inputs&limit=2000`);
 const created=[];
 for(const opp of opps||[]){
   const exists=(tasks||[]).some(t=>t.inputs?.opportunity_id===opp.id&&t.inputs?.action_type==='SALES_FOLLOWUP'&&!['FAILED','CANCELLED'].includes(t.status));
   if(exists) continue;
   const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Client follow-up for opportunity ${opp.id}`,description:'Prepare a concise, factual follow-up using the approved proposal and verified client facts. External sending requires explicit owner approval or a configured compliant outreach integration and consent policy.',status:'AI_READY',priority:88,approval_required:true,inputs:{agent:'SALES',action_type:'SALES_FOLLOWUP',opportunity_id:opp.id,require_owner_approval:true}})}))?.[0];
   if(task){created.push(task.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'SALES_FOLLOWUP_QUEUED',source:'sales-followup-engine',payload:{opportunity_id:opp.id,task_id:task.id}})});}
 }
 return {ok:true,opportunities:(opps||[]).length,followups_queued:created.length,task_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await queueApprovedSalesFollowups());}catch(e){console.error(e);return json(500,{error:'SALES_FOLLOWUP_FAILED',message:e.message});}};
module.exports.queueApprovedSalesFollowups=queueApprovedSalesFollowups;
