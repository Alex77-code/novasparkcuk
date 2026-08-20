const { json, supabaseRequest, verifyUser } = require('./_nova');

const PAYMENT_PROVIDERS=new Set(['stripe','paypal','wise','airwallex']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),quoteId=String(body.quote_id||'').trim(),provider=String(body.provider||'stripe').toLowerCase();
 if(!org||!quoteId||!PAYMENT_PROVIDERS.has(provider))return json(400,{error:'INVALID_PAYMENT_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const quote=(await supabaseRequest(`quotes?id=eq.${encodeURIComponent(quoteId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,lead_id,amount_gbp,currency,status&limit=1`))?.[0];
 if(!quote)return json(404,{error:'QUOTE_NOT_FOUND'});
 if(quote.status!=='APPROVED')return json(409,{error:'QUOTE_NOT_APPROVED',status:quote.status});
 const payment={organization_id:org,quote_id:quote.id,lead_id:quote.lead_id,provider,amount_gbp:quote.amount_gbp,currency:quote.currency||'GBP',status:'PAYMENT_PENDING',requires_provider_confirmation:true,created_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('payments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payment)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PAYMENT_REQUEST_CREATED',source:'payment-onboarding-gate',payload:{quote_id:quote.id,payment_id:rows?.[0]?.id||null,provider,amount_gbp:quote.amount_gbp}})});
 return json(200,{ok:true,payment_id:rows?.[0]?.id||null,status:'PAYMENT_PENDING',provider,amount_gbp:quote.amount_gbp,on_payment_confirmed:'START_CLIENT_ONBOARDING'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PAYMENT_ONBOARDING_GATE_FAILED',message:e.message});}};
module.exports.run=run;
