const { json, supabaseRequest, verifyUser } = require('./_nova');

function scoreLead(lead){
  let score=0;
  const text=JSON.stringify(lead||{}).toLowerCase();
  if(lead.website) score+=20;
  if(lead.email) score+=15;
  if(/uk|london|manchester|birmingham|bristol|leeds|glasgow/.test(text)) score+=15;
  if(/seo|marketing|agency|ecommerce|shop|business|website/.test(text)) score+=20;
  if(lead.source) score+=10;
  return Math.min(score,100);
}

async function qualifyLeads(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&status=in.(RESEARCH_QUEUE,NEW)&select=*&limit=100`);
 const results=[];
 for(const lead of leads||[]){
   const score=scoreLead(lead);
   const status=score>=60?'QUALIFIED':score>=35?'NURTURE':'DISQUALIFIED';
   await supabaseRequest(`leads?id=eq.${lead.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,qualification_score:score,updated_at:new Date().toISOString()})});
   if(status==='QUALIFIED'){
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'LEAD_QUALIFIED',source:'lead-qualification-engine',payload:{lead_id:lead.id,score}})});
   }
   results.push({lead_id:lead.id,status,score});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CRO',action:'QUALIFY_LEADS',resource_type:'leads',metadata:{processed:results.length,qualified:results.filter(r=>r.status==='QUALIFIED').length}})});
 return {ok:true,processed:results.length,qualified:results.filter(r=>r.status==='QUALIFIED').length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await qualifyLeads());}catch(e){console.error(e);return json(500,{error:'LEAD_QUALIFICATION_FAILED',message:e.message});}};
module.exports.qualifyLeads=qualifyLeads;
