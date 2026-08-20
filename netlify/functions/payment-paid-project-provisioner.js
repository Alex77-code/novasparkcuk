const { json, supabaseRequest } = require('./_nova');

function validSecret(event){return Boolean(process.env.NOVA_PAYMENT_WEBHOOK_SECRET)&&event.headers?.['x-nova-payment-secret']===process.env.NOVA_PAYMENT_WEBHOOK_SECRET;}
async function provision(event){
 if(!validSecret(event))return {statusCode:401,body:{error:'INVALID_WEBHOOK_SIGNATURE'}};
 const body=JSON.parse(event.body||'{}'); const {organization_id,reference,status,provider,event_id}=body;
 if(!organization_id||!reference||!provider||!event_id)return {statusCode:400,body:{error:'INVALID_WEBHOOK_PAYLOAD'}};
 if(!['succeeded','paid'].includes(String(status).toLowerCase()))return {statusCode:200,body:{ok:true,ignored:true}};
 const payment=(await supabaseRequest(`payment_ledger?organization_id=eq.${encodeURIComponent(organization_id)}&reference=eq.${encodeURIComponent(reference)}&select=*&limit=1`))?.[0];
 if(!payment)return {statusCode:404,body:{error:'PAYMENT_NOT_FOUND'}};
 if(payment.status==='PAID')return {statusCode:200,body:{ok:true,already_paid:true}};
 const now=new Date().toISOString();
 await supabaseRequest(`payment_ledger?id=eq.${payment.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAID',provider,provider_event_id:event_id,paid_at:now,updated_at:now})});
 if(payment.lead_id){
  const lead=(await supabaseRequest(`leads?id=eq.${payment.lead_id}&organization_id=eq.${organization_id}&select=id,company_name&limit=1`))?.[0];
  if(lead){
   const existing=await supabaseRequest(`projects?organization_id=eq.${organization_id}&name=eq.${encodeURIComponent(lead.company_name||'New Client Project')}&select=id&limit=1`);
   if(!existing?.length){
    const project=await supabaseRequest('projects',{method:'POST',body:JSON.stringify({organization_id, name:`${lead.company_name||'Client'} Marketing Project`, status:'ACTIVE'})});
    await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id,event_type:'PAYMENT_CONFIRMED_PROJECT_PROVISIONED',source:provider,payload:{payment_id:payment.id,reference,event_id,lead_id:lead.id,project_id:project?.[0]?.id||null,provisioned_at:now}})});
    return {statusCode:200,body:{ok:true,paid:true,project_created:true,project_id:project?.[0]?.id||null}};
   }
  }
 }
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id,event_type:'PAYMENT_CONFIRMED',source:provider,payload:{payment_id:payment.id,reference,event_id,confirmed_at:now}})});
 return {statusCode:200,body:{ok:true,paid:true,project_created:false}};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const r=await provision(event);return json(r.statusCode,r.body);}catch(e){console.error(e);return json(500,{error:'PAYMENT_PROVISIONING_FAILED'});}};
module.exports.provision=provision;
