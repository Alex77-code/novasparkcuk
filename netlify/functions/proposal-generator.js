const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runProposalGenerator(){
 const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const opportunities=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&stage=eq.QUALIFIED&select=*&order=updated_at.desc&limit=20`);
 const created=[];
 for(const opportunity of opportunities||[]){
  const brief=`Create a client-ready digital marketing proposal for opportunity ${opportunity.name}. Service and pricing must be based only on verified CRM information and approved NovaSpark packages. Never invent client results, testimonials, guarantees, or completed work.`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.NOVA_AI_MODEL||'gpt-5.6-luna',input:brief})});
  const text=await response.text(); if(!response.ok) throw new Error(`AI ${response.status}: ${text}`);
  const raw=JSON.parse(text); const proposal=raw.output_text||raw.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PROPOSAL_DRAFT_READY',source:'proposal-generator',payload:{opportunity_id:opportunity.id,proposal,approval_required:true}})});
  created.push(opportunity.id);
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CRO',action:'GENERATE_PROPOSALS',resource_type:'opportunities',metadata:{generated:created.length,opportunity_ids:created}})});
 return {ok:true,generated:created.length,opportunity_ids:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runProposalGenerator());}catch(e){console.error(e);return json(500,{error:'PROPOSAL_GENERATION_FAILED',message:e.message});}};
module.exports.runProposalGenerator=runProposalGenerator;
