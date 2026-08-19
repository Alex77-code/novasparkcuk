const { json, required, supabaseRequest, verifyUser } = require('./_nova');

async function executeQueuedActions() {
  const org = (await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if (!org) throw new Error('NovaSpark organization not found');
  const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,spending_enabled,outbound_enabled&limit=1`))?.[0];
  if (controls?.emergency_stop) return { skipped: true, reason: 'EMERGENCY_STOP' };

  const actions = await supabaseRequest(`revenue_brain_actions?organization_id=eq.${org.id}&status=eq.QUEUED&select=*&order=priority.desc,created_at&limit=20`);
  const results = [];
  for (const action of actions || []) {
    const requiresApproval = ['OUTBOUND_CONTACT', 'SPEND_MONEY', 'FINAL_DELIVERY', 'CONTRACT', 'PAYMENT'].includes(String(action.action_type || '').toUpperCase());
    if (requiresApproval) {
      await supabaseRequest(`revenue_brain_actions?id=eq.${action.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'WAITING_APPROVAL', updated_at: new Date().toISOString() }) });
      results.push({ id: action.id, status: 'WAITING_APPROVAL' });
      continue;
    }
    await supabaseRequest(`revenue_brain_actions?id=eq.${action.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'RUNNING', started_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    try {
      const task = (await supabaseRequest('tasks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, title: action.title || action.action_type, description: action.description || null, status: 'RUNNING', priority: Number(action.priority) || 50, risk: 'LOW', approval_required: false, inputs: action.payload || {} }) }))?.[0];
      await supabaseRequest(`revenue_brain_actions?id=eq.${action.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'COMPLETED', task_id: task?.id || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      results.push({ id: action.id, status: 'COMPLETED', task_id: task?.id || null });
    } catch (e) {
      await supabaseRequest(`revenue_brain_actions?id=eq.${action.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'FAILED', error: e.message, updated_at: new Date().toISOString() }) });
      results.push({ id: action.id, status: 'FAILED', error: e.message });
    }
  }
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_AGENT_EXECUTION', action: 'EXECUTE_REVENUE_ACTIONS', resource_type: 'revenue_brain_actions', metadata: { processed: results.length, results } }) });
  return { ok: true, processed: results.length, results };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    return json(200, await executeQueuedActions());
  } catch (e) { console.error(e); return json(500, { error: 'AGENT_EXECUTION_FAILED', message: e.message }); }
};

module.exports.executeQueuedActions = executeQueuedActions;
