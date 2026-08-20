const { json, supabaseRequest, verifyUser } = require('./_nova');

const STATUSES=new Set(['DRAFT','ISSUED','PAID','VOID','OVERDUE']);
const ROLES=new Set(['OWNER','ADMIN','MANAGER','SALES','FINANCE']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),clientId=String(body.client_id||'').trim();if(!org||!clientId)return json(400,{error:'ORGANIZATION_AND_CLIENT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'BILLING_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const client=(await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,email,status&limit=1`))?.[0];if(!client)return json(404,{error:'CLIENT_NOT_FOUND'});
 if(!['ACTIVE','ONBOARDING'].includes(client.status))return json(409,{error:'CLIENT_NOT_BILLABLE',status:client.status});
 const items=Array.isArray(body.items)?body.items:[];if(!items.length)return json(400,{error:'INVOICE_ITEMS_REQUIRED'});
 const total=items.reduce((sum,x)=>sum+Number(x.quantity||1)*Number(x.unit_price||0),0);if(!Number.isFinite(total)||total<0)return json(400,{error:'INVALID_INVOICE_TOTAL'});
 const currency=String(body.currency||'GBP').toUpperCase(),status=String(body.status||'DRAFT').toUpperCase();if(!STATUSES.has(status))return json(400,{error:'INVALID_INVOICE_STATUS'});
 const invoiceNumber=String(body.invoice_number||`NS-${Date.now()}`);const rows=await supabaseRequest('invoices',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,client_id:clientId,invoice_number:invoiceNumber,items,total,currency,status,due_date:body.due_date||null,created_by:user.id||null,created_at:new Date().toISOString()})});const invoice=rows?.[0];if(!invoice)return json(500,{error:'INVOICE_CREATE_FAILED'});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'INVOICE_CREATED',source:'billing-invoice-engine',payload:{invoice_id:invoice.id,client_id:clientId,total,currency,status}})});
 return json(200,{ok:true,invoice,payment:{status:status==='PAID'?'PAID':'PENDING',provider_not_called:true}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'BILLING_INVOICE_ENGINE_FAILED'});}};
module.exports.run=run;
