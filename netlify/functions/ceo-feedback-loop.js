const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runFeedbackLoop() {
  const org = (await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if (!org) throw new Error('NovaSpark organization not found');
  const goals = await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=*&order=created_at.desc&limit=10`);
  const actions = await supabaseRequest(`revenue_brain_actions?organization_id=eq.${org.id}&select=status,priority,action_type,goal_id&order=created_at.desc&limit=100`);
  const recent = await supabaseRequest(`agent_runs?organization_id=eq.${org.id}&select=agent_id,status,error,created_at&order=created_at.desc&limit=50`);
  const revenue = await supabaseRequest(`revenue_events?organization_id=eq.${org.id}&select=amount,currency,event_type,occurred_at&order=occurred_at.desc&limit=100`);
  const summary = { goals: goals?.length || 0, queued: (actions || []).filter(x => x.status === 'QUEUED').length, running: (actions || []).filter(x => x.status === 'RUNNING').length, completed: (actions || []).filter(x => x.status === 'COMPLETED').length, failed: (actions || []).filter(x => x.status === 'FAILED').length, agent_runs: recent?.length || 0, agent_failures: (recent || []).filter(x => x.status === 'FAILED').length, recent_revenue: (revenue || []).reduce((s,x)=>s + Number(x.amount || 0),0) };
  for (const goal of goals || []) {
    const goalActions = (actions || []).filter(x => x.goal_id === goal.id);
    const failed = goalActions.filter(x => x.status === 'FAILED').length;
    const waiting = goalActions.filter(x => x.status === 'WAITING_APPROVAL').length;
    const status = failed >= 3 ? 'AT_RISK' : (goalActions.length && goalActions.every(x => x.status === 'COMPLETED') ? 'ON_TRACK' : 'EXECUTING');
    await supabaseRequest(`ceo_goals?id=eq.${goal.id}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({ status: status === 'ON_TRACK' ? 'ACTIVE' : 'ACTIVE', updated_at:new Date().toISOString() }) });
    await supabaseRequest('ceo_kpi_snapshots', { method:'POST', body:JSON.stringify({ organization_id:org.id, goal_id:goal.id, snapshot:{status,failed_actions:failed,waiting_approval:waiting,summary}, source:'CEO_FEEDBACK_LOOP' }) });
    if (failed > 0) await supabaseRequest('events', { method:'POST', body:JSON.stringify({ organization_id:org.id,event_type:'CEO_REPLAN_REQUIRED',source:'ceo-feedback-loop',payload:{goal_id:goal.id,status,failed_actions:failed,waiting_approval:waiting}}) });
  }
  await supabaseRequest('audit_logs', { method:'POST', body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CEO',action:'FEEDBACK_LOOP',resource_type:'ceo_goals',metadata:summary}) });
  return {ok:true,summary};
}

exports.handler = async event => {
  if(event.httpMethod !== 'POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
  try { const user=await verifyUser(event.headers.authorization || event.headers.Authorization); if(!user) return json(401,{error:'AUTHENTICATION_REQUIRED'}); return json(200,await runFeedbackLoop()); }
  catch(e){ console.error(e); return json(500,{error:'CEO_FEEDBACK_FAILED',message:e.message}); }
};
module.exports.runFeedbackLoop=runFeedbackLoop;
