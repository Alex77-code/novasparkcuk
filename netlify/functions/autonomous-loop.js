const crypto = require('node:crypto');
const { json, supabaseRequest, verifyUser } = require('./_nova');

function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function verifyCronOrUser(event) {
  // Netlify scheduled invocation has no HTTP method. Manual HTTP calls still require the cron secret or a user token.
  if (!event.httpMethod && process.env.NETLIFY) return { type: 'scheduled' };
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const cronSecret = process.env.NOVA_CRON_SECRET;
  if (cronSecret && auth.startsWith('Bearer ') && safeEqual(auth.slice(7), cronSecret)) return { type: 'cron' };
  const user = await verifyUser(auth);
  return user ? { type: 'user', user } : null;
}

async function runAutonomousLoop() {
  const org = (await supabaseRequest('organizations?select=id,name,slug,timezone,currency&slug=eq.novaspark-creative&limit=1'))?.[0];
  if (!org) throw new Error('NovaSpark organization not found');
  const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,automation_enabled&limit=1`))?.[0];
  if (controls?.emergency_stop) return { skipped: true, reason: 'EMERGENCY_STOP' };
  if (controls && controls.automation_enabled === false) return { skipped: true, reason: 'AUTOMATION_PAUSED' };

  const [goals, tasks, events] = await Promise.all([
    supabaseRequest(`goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_value,target_currency,target_date,forecast&order=created_at.desc&limit=20`),
    supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,goal_id,status,priority,inputs,updated_at&order=updated_at.desc&limit=1000`),
    supabaseRequest(`events?organization_id=eq.${org.id}&select=event_type,payload,created_at&order=created_at.desc&limit=200`)
  ]);

  const actions = [];
  for (const goal of goals || []) {
    const goalTasks = (tasks || []).filter(t => t.goal_id === goal.id || t.inputs?.goal_id === goal.id);
    const active = goalTasks.filter(t => ['PLANNED', 'PENDING', 'RUNNING', 'WAITING_APPROVAL'].includes(t.status)).length;
    const failed = goalTasks.filter(t => t.status === 'FAILED').length;
    if (active === 0 && failed === 0) {
      actions.push({ type: 'REPLAN_REQUIRED', goal_id: goal.id, reason: 'No active execution tasks' });
      await supabaseRequest('tasks', { method: 'POST', body: JSON.stringify({ organization_id: org.id, goal_id: goal.id, title: `Plan next actions for ${goal.title}`, description: `Review current company state and create the highest-value low-risk execution tasks for the goal: ${goal.title}`, priority: 90, risk: 'LOW', approval_required: false, status: 'PLANNED', inputs: { goal_id: goal.id, source: 'autonomous-loop' } }) });
    }
    if (failed > 0) actions.push({ type: 'RECOVERY_REQUIRED', goal_id: goal.id, failed_tasks: failed });
  }

  for (const action of actions) {
    await supabaseRequest('events', { method: 'POST', body: JSON.stringify({ organization_id: org.id, event_type: 'CEO_LOOP_ACTION', source: 'autonomous-loop', payload: action }) });
  }
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_CEO', action: 'AUTONOMOUS_LOOP_RUN', entity_type: 'goals', status: 'COMPLETED', metadata: { active_goals: (goals || []).length, actions: actions.length, recent_events: (events || []).length } }) });

  // Run the low-risk AI worker in the same cycle. It will refuse external/high-impact actions without approval.
  let worker = null;
  if (process.env.NOVA_CRON_SECRET) {
    const base = (process.env.URL || `https://${process.env.SITE_NAME}.netlify.app`).replace(/\/$/, '');
    const response = await fetch(`${base}/.netlify/functions/nova-worker`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.NOVA_CRON_SECRET}`, 'content-type': 'application/json' }, body: '{}' });
    const text = await response.text();
    try { worker = JSON.parse(text); } catch { worker = { statusCode: response.status, body: text }; }
  } else {
    worker = { skipped: true, reason: 'NOVA_CRON_SECRET_NOT_CONFIGURED' };
  }

  return { ok: true, organization_id: org.id, active_goals: (goals || []).length, actions, recent_events: (events || []).length, worker };
}

exports.handler = async event => {
  if (event.httpMethod && event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const auth = await verifyCronOrUser(event);
    if (!auth) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    return json(200, await runAutonomousLoop());
  } catch (e) {
    console.error(e);
    return json(500, { error: 'AUTONOMOUS_LOOP_FAILED', message: e.message });
  }
};
module.exports.runAutonomousLoop = runAutonomousLoop;
