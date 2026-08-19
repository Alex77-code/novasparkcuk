const { json, supabaseRequest, verifyUser } = require('./_nova');

async function generateProposalTasks(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const opportunities=await supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&status=eq.PROPOSAL_READY&select=*&limit=100`);
 const created=[];
 for(const opportunity of opportunities||[]){
   const existing=(await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,inputs&limit=1000`))||[];
   if(existing.some(t=>t.inputs?.opportunity_id===opportunity.id && t.inputs?.action_type==='PROPOSAL_GENERATION' && !['FAILED','CANCELLED'].includes(t.status))) continue;
   const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Generate proposal for opportunity ${opportunity.id}`,description:'Create a professional NovaSpark proposal using only verified lead/business facts, approved services, and configured pricing. Include scope, deliverables, timeline, commercial terms, assumptions and next steps. Never fabricate testimonials, results, credentials or client facts. Proposal must be reviewable before sending.',status:'AI_READY',priority:80,approval_required:true,inputs:{agent:'SALES',action_type:'PROPOSAL_GENERATION',opportunity_id:opportunity.id,require_owner_approval:true}})}))?.[0];
   if(task){created.push(task.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PROPOSAL_TASK_CREATED',source:'proposal-engine',payload:{opportunity_id:opportunity.id,task_id:task.id}})});}
 }
 return {ok:true,opportunities:(opportunities||[]).length,tasks_created:created.length,task_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await generateProposalTasks());}catch(e){console.error(e);return json(500,{error:'PROPOSAL_ENGINE_FAILED',message:e.message});}};
module.exports.generateProposalTasks=generateProposalTasks;
