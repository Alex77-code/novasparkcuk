const crypto=require('crypto');
const {json,supabaseRequest}=require('./_nova');

function verifySignature(raw,signature,secret){
 if(!signature||!secret)return false;
 const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}

async function reconcile(event){
 const raw=event.body||'';
 const signature=event.headers?.['x-nova-signature']||event.headers?.['X-Nova-Signature'];
 const secret=process.env.NOVA_PAYMENT_WEBHOOK_SECRET;
 if(!verifySignature(raw,signature,secret)) throw new Error('INVALID_WEBHOOK_SIGNATURE');
 const payload=JSON.parse(raw);
 const provider=String(payload.provider||'').toUpperCase();
 const providerEventId=payload.event_id||payload.id;
 const status=String(payload.status||'').toUpperCase();
 if(!providerEventId||!provider||!status) throw new Error('INVALID_PAYMENT_EVENT');
 const existing=await supabaseRequest(`payment_events?provider=eq.${encodeURIComponent(provider)}&provider_event_id=eq.${encodeURIComponent(providerEventId)}&select=id&limit=1`);
 if(existing?.length) return {ok:true,duplicate:true};
 await supabaseRequest('payment_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({provider,provider_event_id:providerEventId,status,amount:payload.amount||null,currency:payload.currency||null,raw_event:{type:payload.type||null}})});
 if(status==='PAID'&&payload.payment_id){
   await supabaseRequest(`payments?id=eq.${encodeURIComponent(payload.payment_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAID',provider,provider_event_id:providerEventId,confirmed_at:new Date().toISOString()})});
 }
 return {ok:true,duplicate:false,status,provider,provider_event_id:providerEventId};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return json(200,await reconcile(event));}catch(e){console.error(e);return json(400,{error:'PAYMENT_WEBHOOK_REJECTED',message:e.message});}};
module.exports.reconcile=reconcile;
