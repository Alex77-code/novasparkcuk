const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function sb(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function callFunction(name, payload) {
  const base = process.env.NOVA_SITE_URL || `https://${process.env.SITE_NAME || 'novasparkuk'}.netlify.app`;
  const response = await fetch(`${base}/.netlify/functions/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.NOVA_AUTOPILOT_SECRET ? { authorization: `Bearer ${process.env.NOVA_AUTOPILOT_SECRET}` } : {}) }, body: JSON.stringify(payload) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

export default async (req) => {
  if (req.httpMethod !== 'POST' && req.httpMethod !== 'GET') return json(405, { error: 'GET or POST required' });
  const secret = process.env.NOVA_AUTOPILOT_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return json(401, { error: 'Unauthorized' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' });

  const runRows = await sb('ceo_execution_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ trigger: req.httpMethod === 'GET' ? 'scheduled' : 'manual' }) });
  const run = runRows[0];
  const summary = { dispatched: 0, completed: 0, failed: 0, blocked: 0 };

  try {
    const goals = await sb('ceo_goals?status=eq.active&select=id,natural_language_goal,target_amount,currency,target_date&order=created_at.desc&limit=10');
    for (const goal of goals) {
      const tasks = await sb(`ceo_tasks?goal_id=eq.${goal.id}&status=eq.queued&order=priority.desc&limit=8`);
      for (const task of tasks) {
        if (task.requires_approval) {
          await sb(`ceo_tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'waiting_approval', error: 'Owner approval required before external action.' }) });
          summary.blocked++;
          continue;
        }
        await sb(`ceo_tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'running', started_at: new Date().toISOString() }) });
        try {
          let result;
          if (task.task_type === 'acquisition') result = await callFunction('acquisition', { goal_id: goal.id, limit: 10 });
          else if (task.task_type === 'delivery') result = await callFunction('delivery', { goal_id: goal.id });
          else {
            await sb(`ceo_tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'queued', error: 'No execution adapter registered yet; retained in queue instead of fabricating completion.' }) });
            continue;
          }
          await sb(`ceo_tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'completed', result, completed_at: new Date().toISOString(), error: null }) });
          summary.dispatched++;
          summary.completed++;
        } catch (error) {
          await sb(`ceo_tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', error: error.message, completed_at: new Date().toISOString() }) });
          summary.failed++;
        }
      }

      const revenue = await sb(`revenue_events?select=amount&currency=eq.${encodeURIComponent(goal.currency || 'GBP')}`);
      const opportunities = await sb(`opportunities?select=amount,probability,stage&currency=eq.${encodeURIComponent(goal.currency || 'GBP')}`);
      const leads = await sb('leads?select=id&score=gte.70');
      const projects = await sb('delivery_projects?select=id&status=not.in.(completed,cancelled)');
      const actualRevenue = revenue.reduce((s, r) => s + Number(r.amount || 0), 0);
      const pipeline = opportunities.reduce((s, o) => s + Number(o.amount || 0), 0);
      const weighted = opportunities.reduce((s, o) => s + Number(o.amount || 0) * Number(o.probability || 0) / 100, 0);
      const progress = goal.target_amount ? Math.min(100, actualRevenue / Number(goal.target_amount) * 100) : 0;
      const confidence = goal.target_amount ? Math.min(100, (actualRevenue + weighted) / Number(goal.target_amount) * 100) : 0;
      const status = progress >= 100 ? 'achieved' : confidence >= 80 ? 'active' : confidence >= 45 ? 'at_risk' : 'active';
      await sb(`ceo_goals?id=eq.${goal.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ progress_amount: actualRevenue, confidence, status, updated_at: new Date().toISOString() }) });
      await sb('ceo_kpi_snapshots', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ goal_id: goal.id, revenue: actualRevenue, pipeline, qualified_leads: leads.length, open_opportunities: opportunities.length, active_projects: projects.length, snapshot: { weighted_pipeline: weighted, target: goal.target_amount, confidence, status } }) });
    }
    await sb(`ceo_execution_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: summary.failed ? 'partial' : 'completed', summary: `CEO cycle completed: ${summary.completed} task executions, ${summary.blocked} approvals waiting, ${summary.failed} failures.`, metrics: summary, finished_at: new Date().toISOString() }) });
    return json(200, { ok: true, run_id: run.id, summary });
  } catch (error) {
    await sb(`ceo_execution_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', summary: error.message, metrics: summary, finished_at: new Date().toISOString() }) }).catch(() => {});
    return json(500, { error: error.message, run_id: run.id, summary });
  }
};