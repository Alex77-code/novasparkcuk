const { json, supabaseRequest, verifyUser } = require('./_nova');

async function queuePaymentRequests(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const opps=await supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&status=eq.CLIENT_ACCEPTED&select=*&limit=100`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,inputs&limit=2000`);
 const created=[];
 for(const opp of opps||[]){
   const exists=(tasks||[]).some(t=>t.inputs?.opportunity_id===opp.id&&t.inputs?.action_type==='PAYMENT_REQUEST'&&!['FAILED','CANCELLED'].includes(t.status));
   if(exists) continue;
   const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Create invoice/payment request for ${opp.id}`,description:'Prepare a payment request using the approved commercial terms and configured billing provider. Never mark payment as received without verified provider confirmation. Recurring billing may only use an explicitly configured subscription plan and client authorization.',status:'AI_READY',priority:92,approval_required:true,inputs:{agent:'CFO',action_type:'PAYMENT_REQUEST',opportunity_id:opp.id,recurring_billing_allowed:true,require_payment_provider_confirmation:true}})}))?.[0];
   if(task){created.push(task.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PAYMENT_REQUEST_QUEUED',source:'invoice-subscription-engine',payload:{opportunity_id:opp.id,task_id:task.id}})});}
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CFO',action:'QUEUE_PAYMENT_REQUESTS',resource_type:'sales_opportunities',metadata:{accepted_opportunities:(opps||[]).length,requests_queued:created.length}})});
 return {ok:true,accepted_opportunities:(opps||[]).length,requests_queued:created.length,task_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await queuePaymentRequests());}catch(e){console.error(e);return json(500,{error:'INVOICE_SUBSCRIPTION_FAILED',message:e.message});}};
module.exports.queuePaymentRequests=queuePaymentRequests;
