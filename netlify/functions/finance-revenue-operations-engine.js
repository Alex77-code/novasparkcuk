const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','FINANCE','OPERATIONS']);
const ACTIONS=new Set(['DASHBOARD','INVOICE_PLAN','PAYMENT_RECONCILIATION','EXPENSE_PLAN','REVENUE_FORECAST']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'DASHBOARD').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'FINANCE_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const [invoices,payments,expenses]=await Promise.all([
  supabaseRequest(`invoices?organization_id=eq.${encodeURIComponent(org)}&select=id,status,total,currency,due_date,paid_at&limit=500`),
  supabaseRequest(`payments?organization_id=eq.${encodeURIComponent(org)}&select=id,status,amount,currency,paid_at&limit=500`),
  supabaseRequest(`expenses?organization_id=eq.${encodeURIComponent(org)}&select=id,status,amount,currency,expense_date&limit=500`)
 ]);
 const inv=invoices||[],pay=payments||[],exp=expenses||[];const sum=(rows,key='amount')=>rows.reduce((n,r)=>n+(Number(r[key])||0),0);const currency=String(body.currency||'GBP').toUpperCase();
 const metrics={invoice_count:inv.length,invoiced_total:sum(inv,'total'),payment_count:pay.length,received_total:sum(pay),expense_count:exp.length,expense_total:sum(exp),outstanding_invoices:inv.filter(x=>!['PAID','CANCELLED'].includes(String(x.status).toUpperCase())).length,currency};
 const plan=action==='DASHBOARD'?metrics:action==='INVOICE_PLAN'?['Validate client billing details','Generate invoice with line items and due date','Require finance approval before issuing','Track overdue status and reminders']:action==='PAYMENT_RECONCILIATION'?['Match payment to invoice/client','Flag unmatched or duplicate transactions','Record reconciliation outcome']:action==='EXPENSE_PLAN'?['Categorise business expenses','Validate receipts and approvals','Track recurring costs and monthly totals']:['Use historical paid revenue','Model recurring and contracted revenue','Create conservative/base/upside scenarios','Flag assumptions requiring finance review'];
 const payload={action,metrics,plan,execution_mode:'PLAN_ONLY',auto_charge:false,auto_payout:false,generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'FINANCE_REVENUE_PLAN_GENERATED',source:'finance-revenue-operations-engine',payload})});
 return json(200,{ok:true,finance:payload,next_step:'CONNECT_BILLING_PROVIDER_AND_FINANCE_LEDGER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'FINANCE_ENGINE_FAILED'});}};
module.exports.run=run;
