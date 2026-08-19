const { json, supabaseRequest, verifyUser } = require('./_nova');

async function advanceApprovedDeals(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.APPROVED&select=*&limit=100`);
 const advanced=[];
 for(const task of tasks||[]){
   if(task.inputs?.action_type!=='PROPOSAL_GENERATION') continue;
   const opportunityId=task.inputs?.opportunity_id;
   if(!opportunityId) continue;
   const now=new Date().toISOString();
   await supabaseRequest(`sales_opportunities?id=eq.${opportunityId}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'AWAITING_CLIENT_ACCEPTANCE',stage:'PROPOSAL_APPROVED',updated_at:now})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PROPOSAL_APPROVED_FOR_CLIENT',source:'deal-payment-engine',payload:{opportunity_id:opportunityId,task_id:task.id}})});
   advanced.push(opportunityId);
 }
 return {ok:true,advanced:advanced.length,opportunity_ids:advanced};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await advanceApprovedDeals());}catch(e){console.error(e);return json(500,{error:'DEAL_PAYMENT_ENGINE_FAILED',message:e.message});}};
module.exports.advanceApprovedDeals=advanceApprovedDeals;
