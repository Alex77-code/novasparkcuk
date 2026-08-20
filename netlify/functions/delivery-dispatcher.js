const { json, supabaseRequest, verifyUser } = require('./_nova');

function adapterStatus(){
 return {email:Boolean(process.env.NOVA_EMAIL_PROVIDER_URL&&process.env.NOVA_EMAIL_PROVIDER_SECRET),whatsapp:Boolean(process.env.NOVA_WHATSAPP_PROVIDER_URL&&process.env.NOVA_WHATSAPP_PROVIDER_SECRET),portal:true};
}
async function dispatch(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const items=await supabaseRequest(`communication_queue?organization_id=eq.${org.id}&status=eq.QUEUED&select=*&limit=50`);
 const adapters=adapterStatus(), results=[];
 for(const item of items||[]){
  const available=item.channel==='EMAIL'?adapters.email:item.channel==='WHATSAPP'?adapters.whatsapp:adapters.portal;
  if(!available){results.push({id:item.id,status:'BLOCKED_PROVIDER_NOT_CONFIGURED'});continue;}
  await supabaseRequest(`communication_queue?id=eq.${item.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'READY_TO_SEND',updated_at:new Date().toISOString()})});
  results.push({id:item.id,status:'READY_TO_SEND'});
 }
 return {ok:true,adapters,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await dispatch());}catch(e){console.error(e);return json(500,{error:'DELIVERY_DISPATCH_FAILED',message:e.message});}};
module.exports.dispatch=dispatch;
