const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runFinanceBrain(){
  const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
  const revenue=await supabaseRequest(`revenue_events?organization_id=eq.${org.id}&select=amount,currency,event_type,occurred_at&order=occurred_at.desc&limit=500`);
  const opportunities=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=amount,currency,stage,probability,expected_close_date&order=updated_at.desc&limit=500`);
  const projects=await supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&select=id,status,brief,created_at,updated_at&limit=500`);
  const realized=(revenue||[]).filter(x=>['SALE','PAYMENT','REVENUE'].includes(String(x.event_type).toUpperCase())).reduce((s,x)=>s+Number(x.amount||0),0);
  const pipeline=(opportunities||[]).filter(x=>!['WON','LOST'].includes(x.stage)).reduce((s,x)=>s+Number(x.amount||0),0);
  const weighted=(opportunities||[]).filter(x=>!['WON','LOST'].includes(x.stage)).reduce((s,x)=>s+Number(x.amount||0)*(Number(x.probability||0)/100),0);
  const won=(opportunities||[]).filter(x=>x.stage==='WON').reduce((s,x)=>s+Number(x.amount||0),0);
  const openProjects=(projects||[]).filter(x=>!['COMPLETED','CANCELLED'].includes(x.status)).length;
  const snapshot={realized_revenue:realized,won_value:won,open_pipeline:pipeline,weighted_pipeline:weighted,open_projects:openProjects,currency:'GBP',calculated_at:new Date().toISOString()};
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'FINANCE_SNAPSHOT',source:'finance-brain',payload:snapshot})});
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CFO',action:'FINANCE_ANALYSIS',resource_type:'revenue_events',metadata:snapshot})});
  return {ok:true,snapshot};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runFinanceBrain());}catch(e){console.error(e);return json(500,{error:'FINANCE_BRAIN_FAILED',message:e.message});}};
module.exports.runFinanceBrain=runFinanceBrain;
