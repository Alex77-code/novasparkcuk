const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runBillingEngine(){
 const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const won=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&stage=eq.WON&select=*&order=updated_at.desc&limit=100`);
 const events=await supabaseRequest(`revenue_events?organization_id=eq.${org.id}&select=*&order=occurred_at.desc&limit=500`);
 const created=[];
 for(const deal of won||[]){
   const already=(events||[]).some(e=>e.event_type==='INVOICE_PENDING' && e.metadata?.opportunity_id===deal.id);
   if(already || !Number(deal.amount||0)) continue;
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'INVOICE_PENDING',source:'billing-engine',payload:{opportunity_id:deal.id,company_id:deal.company_id,amount:Number(deal.amount),currency:deal.currency||'GBP',approval_required:true}})});
   created.push(deal.id);
 }
 const outstanding=(events||[]).filter(e=>['INVOICE_PENDING','PAYMENT_DUE'].includes(e.event_type)).reduce((s,e)=>s+Number(e.amount||0),0);
 const snapshot={won_deals:(won||[]).length,invoices_pending:created.length,outstanding_signal:outstanding,currency:'GBP',calculated_at:new Date().toISOString()};
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CFO',action:'BILLING_SCAN',resource_type:'revenue_events',metadata:snapshot})});
 return {ok:true,snapshot,created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runBillingEngine());}catch(e){console.error(e);return json(500,{error:'BILLING_ENGINE_FAILED',message:e.message});}};
module.exports.runBillingEngine=runBillingEngine;
