const { json, required, supabaseRequest } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.6-luna';

function authWorker(event) {
  const configured = process.env.NOVA_WORKER_SECRET;
  if (!configured) return false;
  const supplied = event.headers['x-nova-worker-secret'] || event.headers['X-Nova-Worker-Secret'];
  return supplied && supplied === configured;
}

async function getOrg() {
  const rows = await supabaseRequest('organizations?select=id,name,timezone,currency&name=eq.NovaSpark%20Creative&limit=1');
  if (!rows?.[0]) throw new Error('NovaSpark organization is missing.');
  return rows[0];
}

async function aiExecute(org, task, agent, context) {
  const system = `You are an execution worker inside NovaSpark Creative Ltd AI-BOS. Execute only the supplied task using the supplied company state. Never invent real-world actions, leads, payments, campaign launches, emails sent, customers, or revenue. If the task requires an unavailable external integration, return status ACTION_REQUIRED and explain the exact missing integration. Low-risk internal work such as analysis, planning, scoring, drafting, reporting, data normalization and task decomposition may be completed. Never send unsolicited outbound communication, spend money, alter financial records, or make contractual commitments. Return JSON: {status:"COMPLETED"|"ACTION_REQUIRED"|"FAILED",summary:string,outputs:object,next_tasks:[{title,description,agent_key,priority,risk,approval_required}],requires_approval:boolean,approval_reason:string|null}.`;
  const input = `${system}\n\nORGANIZATION:\n${JSON.stringify(org)}\n\nAGENT:\n${JSON.stringify(agent)}\n\nTASK:\n${JSON.stringify(task)}\n\nCOMPANY STATE:\n${JSON.stringify(context)}`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
    body: JSON.stringify({ model: MODEL, input })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const outputText = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
  try { return JSON.parse(outputText); } catch { return { status: 'FAILED', summary: outputText || 'Model returned no structured output.', outputs: {}, next_tasks: [], requires_approval: false, approval_reason: null }; }
}

async function claimTask(task, org) {
  const updated = await supabaseRequest(`tasks?id=eq.${task.id}&status=eq.PLANNED`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'RUNNING', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  });
  return updated?.[0] || null;
}

async function finishTask(task, result, org) {
  const status = result.status === 'COMPLETED' ? 'COMPLETED' : result.status === 'ACTION_REQUIRED' ? 'WAITING_APPROVAL' : 'FAILED';
  const rows = await supabaseRequest(`tasks?id=eq.${task.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status, outputs: result.outputs || {}, result, error: status === 'FAILED' ? result.summary : null, completed_at: status === 'COMPLETED' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
  });
  if (status === 'WAITING_APPROVAL') {
    await supabaseRequest('approvals', { method: 'POST', body: JSON.stringify({ organization_id: org.id, task_id: task.id, risk: task.risk || 'MEDIUM', action: 'EXTERNAL_OR_HIGH_IMPACT_EXECUTION', payload: { reason: result.approval_reason, task: task.title }, status: 'PENDING' }) });
    await supabaseRequest('notifications', { method: 'POST', body: JSON.stringify({ organization_id: org.id, kind: 'APPROVAL_REQUIRED', severity: 'WARNING', title: 'NOVA needs approval', body: result.summary || task.title, metadata: { task_id: task.id } }) });
  }
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'SYSTEM_AGENT', action: 'TASK_EXECUTED', entity_type: 'task', entity_id: task.id, status, details: { summary: result.summary, model: MODEL } }) });
  return rows?.[0] || null;
}

async function createNextTasks(org, tasks, agents) {
  for (const next of Array.isArray(tasks) ? tasks.slice(0, 10) : []) {
    const agent = agents.find(a => a.key === next.agent_key);
    const risk = ['LOW','MEDIUM','HIGH'].includes(next.risk) ? next.risk : 'LOW';
    const approval = Boolean(next.approval_required || risk !== 'LOW');
    await supabaseRequest('tasks', { method: 'POST', body: JSON.stringify({ organization_id: org.id, agent_id: agent?.id || null, title: String(next.title || 'Follow-up task').slice(0,240), description: String(next.description || '').slice(0,4000), priority: Math.max(0, Math.min(100, Number(next.priority) || 50)), risk, approval_required: approval, status: approval ? 'WAITING_APPROVAL' : 'PLANNED' }) });
  }
}

exports.handler = async (event) => {
  if (!['POST','GET'].includes(event.httpMethod)) return json(405, { error: 'METHOD_NOT_ALLOWED' });
  if (!authWorker(event)) return json(401, { error: 'WORKER_AUTH_REQUIRED' });
  try {
    const org = await getOrg();
    const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,automation_enabled&limit=1`))?.[0];
    if (controls?.emergency_stop) return json(423, { ok: false, status: 'EMERGENCY_STOP' });
    if (controls && controls.automation_enabled === false) return json(423, { ok: false, status: 'AUTOMATION_PAUSED' });

    const [tasks, agents, goals, leads, opportunities, campaigns] = await Promise.all([
      supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.PLANNED&approval_required=eq.false&risk=eq.LOW&order=priority.desc,created_at.asc&limit=5`),
      supabaseRequest(`agents?organization_id=eq.${org.id}&select=id,key,name,role,status,permissions,tools,metrics&order=name.asc`),
      supabaseRequest(`goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,objective,target_value,target_currency,forecast&order=created_at.desc&limit=10`),
      supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,status,score,source&order=created_at.desc&limit=50`),
      supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=id,stage,amount,currency,probability,expected_close_date&order=created_at.desc&limit=50`),
      supabaseRequest(`campaigns?organization_id=eq.${org.id}&select=id,name,channel,status,budget,objective&order=created_at.desc&limit=20`)
    ]);

    const context = { goals, leads, opportunities, campaigns };
    const processed = [];
    for (const task of tasks || []) {
      const claimed = await claimTask(task, org);
      if (!claimed) continue;
      const agent = agents.find(a => a.id === task.agent_id) || agents.find(a => a.key === 'ops') || agents[0];
      const run = await supabaseRequest('agent_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, agent_id: agent?.id || null, task_id: task.id, provider: 'openai', model: MODEL, status: 'RUNNING', input: { task: task.title } }) });
      try {
        const result = await aiExecute(org, task, agent, context);
        await finishTask(task, result, org);
        if (run?.[0]?.id) await supabaseRequest(`agent_runs?id=eq.${run[0].id}`, { method: 'PATCH', body: JSON.stringify({ status: result.status === 'FAILED' ? 'FAILED' : 'COMPLETED', output: result, completed_at: new Date().toISOString() }) });
        await createNextTasks(org, result.next_tasks, agents);
        processed.push({ task_id: task.id, status: result.status, summary: result.summary });
      } catch (error) {
        await supabaseRequest(`tasks?id=eq.${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'FAILED', error: error.message, retries: (task.retries || 0) + 1, updated_at: new Date().toISOString() }) });
        if (run?.[0]?.id) await supabaseRequest(`agent_runs?id=eq.${run[0].id}`, { method: 'PATCH', body: JSON.stringify({ status: 'FAILED', error: { message: error.message }, completed_at: new Date().toISOString() }) });
        processed.push({ task_id: task.id, status: 'FAILED', error: error.message });
      }
    }
    return json(200, { ok: true, processed, remaining_candidate_tasks: Math.max(0, (tasks || []).length - processed.length), model: MODEL });
  } catch (error) {
    console.error(error);
    return json(500, { error: 'NOVA_WORKER_FAILED', message: error.message });
  }
};
