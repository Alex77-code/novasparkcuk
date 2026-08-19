const { json, supabaseRequest, verifyUser } = require('./_nova');

async function processClientResponses(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const responses=await supabaseRequest(`client_responses?organization_id=eq.${org.id}&status=eq.NEW&select=*&limit=100`);
 const updated=[];
 for(const response of responses||[]){
   const type=String(response.response_type||'').toUpperCase();
   let opportunityStatus='AWAITING_CLIENT_ACCEPTANCE';
   let stage='FOLLOW_UP';
   if(['ACCEPTED','YES','WON'].includes(type)){opportunityStatus='CLIENT_ACCEPTED';stage='CLOSED_WON_PENDING_PAYMENT';}
   else if(['REJECTED','NO','LOST'].includes(type)){opportunityStatus='CLOSED';stage='LOST';}
   else if(['QUESTION','NEGOTIATE','REVISE'].includes(type)){opportunityStatus='NEGOTIATION';stage='NEGOTIATION';}
   if(response.opportunity_id){
     await supabaseRequest(`sales_opportunities?id=eq.${response.opportunity_id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:opportunityStatus,stage,updated_at:new Date().toISOString()})});
   }
   await supabaseRequest(`client_responses?id=eq.${response.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PROCESSED',processed_at:new Date().toISOString()})});
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CLIENT_RESPONSE_PROCESSED',source:'client-response-engine',payload:{response_id:response.id,opportunity_id:response.opportunity_id||null,type,opportunity_status:opportunityStatus}})});
   updated.push({response_id:response.id,type,opportunity_status:opportunityStatus});
 }
 return {ok:true,processed:updated.length,results:updated};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await processClientResponses());}catch(e){console.error(e);return json(500,{error:'CLIENT_RESPONSE_FAILED',message:e.message});}};
module.exports.processClientResponses=processClientResponses;
