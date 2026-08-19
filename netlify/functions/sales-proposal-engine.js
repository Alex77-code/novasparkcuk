const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runSalesProposalEngine(){
 const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&status=in.(QUALIFIED,MQL,SQL)&select=*&order=created_at.desc&limit=50`);
 const opps=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=lead_id,company_id,name,stage,amount,currency,probability&order=updated_at.desc&limit=200`);
 const created=[];
 for(const lead of leads||[]){
   if((opps||[]).some(o=>o.lead_id===lead.id && !['LOST','WON'].includes(o.stage))) continue;
   const company=lead.company_id;
   const opportunity=(await supabaseRequest('opportunities',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,lead_id:lead.id,company_id:company,name:`NovaSpark opportunity - ${lead.company_name||lead.name||'Qualified lead'}`,stage:'QUALIFIED',amount:null,currency:'GBP',probability:25,next_action:'Prepare discovery/proposal brief'})}))?.[0];
   if(opportunity){
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PROPOSAL_PREPARATION_REQUIRED',source:'sales-proposal-engine',payload:{opportunity_id:opportunity.id,lead_id:lead.id,approval_required:true}})});
     created.push(opportunity.id);
   }
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CRO',action:'SALES_PROPOSAL_SCAN',resource_type:'opportunities',metadata:{qualified_leads:(leads||[]).length,opportunities_created:created.length}})});
 return {ok:true,qualified_leads:(leads||[]).length,opportunities_created:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runSalesProposalEngine());}catch(e){console.error(e);return json(500,{error:'SALES_PROPOSAL_FAILED',message:e.message});}};
module.exports.runSalesProposalEngine=runSalesProposalEngine;
