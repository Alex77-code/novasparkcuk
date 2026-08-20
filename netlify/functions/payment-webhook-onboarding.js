const { json, supabaseRequest } = require('./_nova');

const PROVIDERS=new Set(['stripe','paypal','wise','airwallex']);
async function run(event){
 const body=JSON.parse(event.body||'{}');
 const provider=String(body.provider||'').toLowerCase();
 const paymentId=String(body.payment_id||'').trim();
 const status=String(body.status||'').toUpperCase();
 const org=String(body.organization_id||'').trim();
 if(!org||!paymentId||!PROVIDERS.has(provider)||!['SUCCEEDED','FAILED','REFUNDED'].includes(status))return json(400,{error:'INVALID_PAYMENT_WEBHOOK'});
 const rows=await supabaseRequest(`payments?id=eq.${encodeURIComponent(paymentId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,quote_id,lead_id,status&limit=1`);
 const payment=rows?.[0];if(!payment)return json(404,{error:'PAYMENT_NOT_FOUND'});
 const next=status==='SUCCEEDED'?'PAID':status;
 await supabaseRequest(`payments?id=eq.${encodeURIComponent(paymentId)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:next,provider_event_received:true,updated_at:new Date().toISOString()})});
 if(status==='SUCCEEDED'){
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PAYMENT_CONFIRMED',source:'payment-webhook-onboarding',payload:{payment_id:paymentId,quote_id:payment.quote_id,lead_id:payment.lead_id,provider}})});
  const projects=await supabaseRequest(`projects?organization_id=eq.${encodeURIComponent(org)}&lead_id=eq.${encodeURIComponent(payment.lead_id)}&select=id&limit=1`);
  if(!projects?.length) await supabaseRequest('projects',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,lead_id:payment.lead_id,status:'ONBOARDING',source:'PAYMENT_CONFIRMED',created_at:new Date().toISOString()})});
 }
 return json(200,{ok:true,payment_id:paymentId,status:next,onboarding_triggered:status==='SUCCEEDED'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PAYMENT_WEBHOOK_FAILED',message:e.message});}};
module.exports.run=run;
