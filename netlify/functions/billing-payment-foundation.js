const { json, supabaseRequest, verifyUser } = require('./_nova');

async function createPaymentIntent(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 const leadId=String(body.lead_id||'').trim(); const amount=Number(body.amount);
 const currency=String(body.currency||'GBP').toUpperCase();
 if(!leadId||!Number.isFinite(amount)||amount<=0)return {error:'INVALID_PAYMENT_REQUEST'};
 const lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${org.id}&select=id,company_name,status&limit=1`))?.[0];
 if(!lead||lead.status!=='WON')return {error:'CLIENT_NOT_ELIGIBLE_FOR_BILLING'};
 const reference=`NS-${lead.id}-${Date.now()}`;
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PAYMENT_INTENT_CREATED',source:'billing-payment-foundation',payload:{lead_id:lead.id,company_name:lead.company_name,reference,amount,currency,status:'PENDING',provider_status:'NOT_CONFIGURED'}})});
 return {ok:true,reference,amount,currency,status:'PENDING',provider_status:'NOT_CONFIGURED',message:'Connect a verified payment provider webhook before marking payment as paid.'};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await createPaymentIntent(event);return json(result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'BILLING_FOUNDATION_FAILED',message:e.message});}};
module.exports.createPaymentIntent=createPaymentIntent;
