const { json, supabaseRequest } = require('./_nova');

function isValidSecret(event){return Boolean(process.env.NOVA_PAYMENT_WEBHOOK_SECRET)&&event.headers?.['x-nova-payment-secret']===process.env.NOVA_PAYMENT_WEBHOOK_SECRET;}
async function handleWebhook(event){
 if(!isValidSecret(event))return {statusCode:401,body:{error:'INVALID_WEBHOOK_SIGNATURE'}};
 const body=JSON.parse(event.body||'{}');
 const {organization_id,reference,status,provider,event_id}=body;
 if(!organization_id||!reference||!provider||!event_id)return {statusCode:400,body:{error:'INVALID_WEBHOOK_PAYLOAD'}};
 if(!['succeeded','paid'].includes(String(status).toLowerCase()))return {statusCode:200,body:{ok:true,ignored:true,status}};
 const duplicate=await supabaseRequest(`events?organization_id=eq.${encodeURIComponent(organization_id)}&event_type=eq.PAYMENT_WEBHOOK_PROCESSED&select=id&limit=1`);
 if(duplicate?.length)return {statusCode:200,body:{ok:true,duplicate:true}};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id,event_type:'PAYMENT_WEBHOOK_PROCESSED',source:provider,payload:{reference,status,event_id,verified_at:new Date().toISOString()}})});
 return {statusCode:200,body:{ok:true,verified:true,reference,status}};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const r=await handleWebhook(event);return json(r.statusCode,r.body);}catch(e){console.error(e);return json(500,{error:'PAYMENT_WEBHOOK_FAILED'});}};
module.exports.handleWebhook=handleWebhook;
