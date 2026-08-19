const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runFinanceReconciliation(){
 const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const revenue=await supabaseRequest(`revenue_events?organization_id=eq.${org.id}&select=*&order=occurred_at.desc&limit=1000`);
 const paid=(revenue||[]).filter(e=>['PAYMENT','PAID','REVENUE'].includes(String(e.event_type||'').toUpperCase())).reduce((s,e)=>s+Number(e.amount||0),0);
 const pending=(revenue||[]).filter(e=>['INVOICE_PENDING','PAYMENT_DUE'].includes(String(e.event_type||'').toUpperCase())).reduce((s,e)=>s+Number(e.amount||0),0);
 const refunds=(revenue||[]).filter(e=>['REFUND','REFUNDED'].includes(String(e.event_type||'').toUpperCase())).reduce((s,e)=>s+Number(e.amount||0),0);
 const net=paid-refunds;
 const alerts=[];
 if(pending>0) alerts.push({type:'RECEIVABLES',priority:70,message:`Outstanding payment signals total ${pending} GBP; review collections.`});
 if(refunds>paid && paid>0) alerts.push({type:'REFUND_RISK',priority:95,message:'Refund signals exceed realized payment signals; investigate immediately.'});
 const snapshot={paid_revenue:paid,pending_receivables:pending,refunds,net_realized_revenue:net,currency:'GBP',alerts,calculated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'FINANCE_RECONCILIATION',source:'finance-reconciliation',payload:snapshot})});
 for(const alert of alerts) await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'FINANCE_ALERT',source:'finance-reconciliation',payload:alert})});
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CFO',action:'FINANCE_RECONCILIATION',resource_type:'revenue_events',metadata:snapshot})});
 return {ok:true,snapshot};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runFinanceReconciliation());}catch(e){console.error(e);return json(500,{error:'FINANCE_RECONCILIATION_FAILED',message:e.message});}};
module.exports.runFinanceReconciliation=runFinanceReconciliation;
