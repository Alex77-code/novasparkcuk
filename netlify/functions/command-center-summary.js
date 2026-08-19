const { json, supabaseRequest, verifyUser } = require('./_nova');

async function summary(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 const [goals,leads,opps,payments,projects,tasks]=await Promise.all([
  supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_amount`),
  supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,status&limit=2000`),
  supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&select=id,status,expected_value&limit=2000`),
  supabaseRequest(`payments?organization_id=eq.${org.id}&select=id,status,amount&limit=2000`),
  supabaseRequest(`client_projects?organization_id=eq.${org.id}&select=id,status&limit=2000`),
  supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,assigned_agent,priority&limit=2000`)
 ]);
 const revenue=(payments||[]).filter(p=>p.status==='PAID').reduce((s,p)=>s+(Number(p.amount)||0),0);
 return {ok:true,generated_at:new Date().toISOString(),emergency_stop:Boolean(stop?.emergency_stop),goals:goals||[],metrics:{leads:(leads||[]).length,open_opportunities:(opps||[]).filter(o=>!['LOST','CLOSED'].includes(o.status)).length,paid_revenue:revenue,active_projects:(projects||[]).filter(p=>p.status==='ACTIVE_DELIVERY').length,tasks:(tasks||[]).length,running_tasks:(tasks||[]).filter(t=>t.status==='RUNNING').length,failed_tasks:(tasks||[]).filter(t=>t.status==='FAILED').length,queued_tasks:(tasks||[]).filter(t=>['QUEUED','AI_READY'].includes(t.status)).length},agent_load:Object.fromEntries((tasks||[]).reduce((m,t)=>{const a=t.assigned_agent||'UNASSIGNED';m.set(a,(m.get(a)||0)+1);return m;},new Map()))};
}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await summary());}catch(e){console.error(e);return json(500,{error:'COMMAND_CENTER_SUMMARY_FAILED',message:e.message});}};
module.exports.summary=summary;
