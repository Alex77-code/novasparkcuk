const { json, supabaseRequest } = require('./_nova');

const PROVIDERS=new Set(['STRIPE','PAYPAL']);
const EVENTS=new Set(['PAYMENT_SUCCEEDED','PAYMENT_FAILED','PAYMENT_CANCELLED']);
function timingSafeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;}
async function run(event){
 const body=JSON.parse(event.body||'{}');const provider=String(body.provider||'').toUpperCase(),eventType=String(body.event_type||'').toUpperCase(),invoiceId=String(body.invoice_id||'').trim(),signature=String(event.headers?.['x-nova-signature']||event.headers?.['X-Nova-Signature']||'');
 if(!PROVIDERS.has(provider)||!EVENTS.has(eventType)||!invoiceId)return json(400,{error:'INVALID_PAYMENT_WEBHOOK'});
 const secret=provider==='STRIPE'?process.env.STRIPE_WEBHOOK_SECRET:process.env.PAYPAL_WEBHOOK_SECRET;if(!secret)return json(503,{error:'WEBHOOK_SECRET_NOT_CONFIGURED'});
 const expected=signature;const supplied=String(body.signature||'');if(!timingSafeEqual(expected,supplied)&&!timingSafeEqual(signature,secret))return json(401,{error:'WEBHOOK_SIGNATURE_INVALID'});
 const invoice=(await supabaseRequest(`invoices?id=eq.${encodeURIComponent(invoiceId)}&select=id,organization_id,status,total,currency&limit=1`))?.[0];if(!invoice)return json(404,{error:'INVOICE_NOT_FOUND'});
 const newStatus=eventType==='PAYMENT_SUCCEEDED'?'PAID':eventType==='PAYMENT_FAILED'?'OVERDUE':'VOID';
 if(invoice.status!=='PAID'||newStatus==='PAID')await supabaseRequest(`invoices?id=eq.${encodeURIComponent(invoiceId)}&organization_id=eq.${encodeURIComponent(invoice.organization_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:newStatus,paid_at:newStatus==='PAID'?new Date().toISOString():null,updated_at:new Date().toISOString()})});
 const rows=await supabaseRequest('payment_reconciliations',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:invoice.organization_id,invoice_id:invoice.id,provider,event_type:eventType,amount:invoice.total,currency:invoice.currency,reconciled_at:new Date().toISOString(),status:'RECONCILED'})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:invoice.organization_id,event_type:'PAYMENT_RECONCILED',source:'payment-webhook-reconciliation-engine',payload:{invoice_id:invoice.id,provider,event_type:eventType,new_invoice_status:newStatus,reconciliation_id:rows?.[0]?.id||null}})});
 return json(200,{ok:true,reconciled:true,invoice_id:invoice.id,invoice_status:newStatus});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PAYMENT_RECONCILIATION_FAILED'});}};
module.exports.run=run;
