const { json, supabaseRequest, verifyUser } = require('./_nova');

async function createSalesOpportunities(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&status=eq.QUALIFIED&select=*&limit=100`);
 const opportunities=await supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&select=lead_id,status&limit=1000`);
 const created=[];
 for(const lead of leads||[]){
   if((opportunities||[]).some(o=>o.lead_id===lead.id && !['LOST','CLOSED'].includes(o.status))) continue;
   const opportunity=(await supabaseRequest('sales_opportunities',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,lead_id:lead.id,status:'PROPOSAL_READY',stage:'QUALIFIED',probability:Math.min(Math.max(Number(lead.qualification_score||0),0),100),source:'AUTONOMOUS_SALES_ENGINE',notes:'Generated from qualified lead. Proposal must use verified business facts and approved NovaSpark pricing; no fabricated case studies or claims.'})}))?.[0];
   if(opportunity){created.push(opportunity.id);await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'SALES_OPPORTUNITY_CREATED',source:'sales-opportunity-engine',payload:{opportunity_id:opportunity.id,lead_id:lead.id}})});}
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CRO',action:'CREATE_SALES_OPPORTUNITIES',resource_type:'sales_opportunities',metadata:{qualified_leads:(leads||[]).length,created:created.length}})});
 return {ok:true,processed:(leads||[]).length,created:created.length,opportunity_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await createSalesOpportunities());}catch(e){console.error(e);return json(500,{error:'SALES_OPPORTUNITY_FAILED',message:e.message});}};
module.exports.createSalesOpportunities=createSalesOpportunities;
