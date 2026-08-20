const { json, supabaseRequest, verifyUser } = require('./_nova');

const PROVIDERS=new Set(['STRIPE','PAYPAL']);
const ROLES=new Set(['OWNER','ADMIN','MANAGER','FINANCE']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),invoiceId=String(body.invoice_id||'').trim(),provider=String(body.provider||'').toUpperCase();
 if(!org||!invoiceId||!PROVIDERS.has(provider))return json(400,{error:'ORGANIZATION_INVOICE_PROVIDER_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'PAYMENT_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const invoice=(await supabaseRequest(`invoices?id=eq.${encodeURIComponent(invoiceId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,client_id,total,currency,status&limit=1`))?.[0];if(!invoice)return json(404,{error:'INVOICE_NOT_FOUND'});
 if(['PAID','VOID'].includes(invoice.status))return json(409,{error:'INVOICE_NOT_PAYABLE',status:invoice.status});
 const sessionId=`pay_${invoice.id}_${Date.now()}`;
 const rows=await supabaseRequest('payment_sessions',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,invoice_id:invoice.id,provider,status:'PENDING',amount:invoice.total,currency:invoice.currency,session_id:sessionId,created_by:user.id||null,created_at:new Date().toISOString()})});
 if(!rows?.[0])return json(500,{error:'PAYMENT_SESSION_CREATE_FAILED'});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PAYMENT_SESSION_CREATED',source:'payment-gateway-engine',payload:{invoice_id:invoice.id,provider,session_id:sessionId,amount:invoice.total,currency:invoice.currency}})});
 return json(200,{ok:true,payment_session:rows[0],provider,provider_called:false,next_step:'CONNECT_PROVIDER_CHECKOUT'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PAYMENT_GATEWAY_ENGINE_FAILED'});}};
module.exports.run=run;
