const { json, required, supabaseRequest } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.4';
const MAX_TASKS = 10;

const AGENT_PROMPTS = {
  NOVA_PROSPECTOR: 'You are Nova Prospector. Identify the next compliant prospecting actions from the supplied company data. Never invent prospects or contact data. If a real data source is unavailable, return ACTION_REQUIRED.',
  NOVA_LEADGEN: 'You are Nova LeadGen. Design and execute only data-backed lead generation steps available through the supplied tools/data. Never fabricate leads.',
  NOVA_SALES: 'You are Nova Sales. Prioritize real opportunities, calculate next actions and prepare evidence-based sales actions. Never claim a message was sent unless a connected provider confirms it.',
  NOVA_CRM: 'You are Nova CRM. Keep customer and pipeline records consistent. Only change records through explicit supported operations.',
  NOVA_SEO: 'You are Nova SEO. Analyze supplied website/search data and produce concrete optimization tasks. Do not claim rankings or traffic without real data.',
  NOVA_CONTENT: 'You are Nova Content. Produce content briefs/drafts from the task and company context. Publishing requires a connected and authorized provider.',
  NOVA_SOCIAL: 'You are Nova Social. Create platform-ready content and schedules. Publishing requires a connected and authorized provider.',
  NOVA_ADS: 'You are Nova Ads. Analyze supplied campaign data and recommend optimization. Never spend money or change budgets without approval.',
  NOVA_EMAIL: 'You are Nova Email. Draft compliant outreach/follow-ups. Sending requires a connected provider, consent/eligibility checks and authorization.',
  NOVA_ANALYTICS: 'You are Nova Analytics. Calculate KPIs only from supplied data and flag missing data explicitly.',
  NOVA_CLIENT: 'You are Nova Client. Prepare onboarding, delivery and retention actions from real client records.',
  NOVA_FINANCE: 'You are Nova Finance. Analyze real financial records and identify profitable actions. Never fabricate payments or balances.',
  NOVA_QA: 'You are Nova QA. Validate task outputs and flag unsupported claims, missing evidence or unsafe actions.'
};

async function callAI(agentKey, task, context) {
  const system = AGENT_PROMPTS[agentKey] || 'You are a NovaSpark specialist agent. Execute only safe, authorized, data-backed work and never fabricate results.';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
    body: JSON.stringify({
      model: MODEL,
      input: `${system}\n\nReturn JSON with keys: status, result, actions, blockers, approval_required.\n\nTASK:\n${JSON.stringify(task)}\n\nCOMPANY CONTEXT:\n${JSON.stringify(context)}`
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const output = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
  try { return JSON.parse(output); } catch { return { status: 'COMPLETED', result: output, actions: [], blockers: [], approval_required: false }; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const cronSecret = process.env.NOVA_CRON_SECRET;
    if (cronSecret && event.headers?.['x-nova-cron-secret'] !== cronSecret) return json(401, { error: 'CRON_AUTH_REQUIRED' });

    const orgs = await supabaseRequest('organizations?select=id,name,currency&name=eq.NovaSpark%20Creative&limit=1');
    const org = orgs?.[0];
    if (!org) throw new Error('NovaSpark organization is missing.');
    const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,automation_enabled,spending_enabled,outbound_enabled&limit=1`))?.[0];
    if (controls?.emergency_stop || controls?.automation_enabled === false) return json(423, { error: 'AUTOMATION_HALTED' });

    const tasks = await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.PLANNED&select=id,title,description,priority,risk,approval_required,agent_id,goal_id,project_id,inputs&order=priority.desc,created_at.asc&limit=${MAX_TASKS}`);
    const agents = await supabaseRequest(`agents?organization_id=eq.${org.id}&select=id,key,name,role,status,metrics`);
    const memory = await supabaseRequest(`memory?organization_id=eq.${org.id}&select=category,key,value,importance&order=importance.desc&limit=40`);
    const results = [];

    for (const task of tasks || []) {
      if (task.approval_required || task.risk !== 'LOW') continue;
      const agent = agents.find(a => a.id === task.agent_id);
      if (!agent) continue;
      const started = Date.now();
      await supabaseRequest(`tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'RUNNING', started_at: new Date().toISOString() }) });
      try {
        const result = await callAI(agent.key, task, { organization: org, memory, available_agents: agents.map(a => ({ key: a.key, role: a.role })) });
        const needsApproval = Boolean(result.approval_required || result.status === 'ACTION_REQUIRED');
        const status = needsApproval ? 'WAITING_APPROVAL' : 'COMPLETED';
        await supabaseRequest(`tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, completed_at: status === 'COMPLETED' ? new Date().toISOString() : null, outputs: result }) });
        await supabaseRequest('agent_runs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, agent_id: agent.id, task_id: task.id, status, duration_ms: Date.now() - started, input: { task }, output: result }) });
        results.push({ task_id: task.id, agent: agent.key, status });
      } catch (error) {
        await supabaseRequest(`tasks?id=eq.${task.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'FAILED', error: error.message }) });
        await supabaseRequest('agent_runs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, agent_id: agent.id, task_id: task.id, status: 'FAILED', duration_ms: Date.now() - started, error: { message: error.message } }) });
        results.push({ task_id: task.id, agent: agent.key, status: 'FAILED' });
      }
    }
    return json(200, { ok: true, organization: org.name, processed: results.length, results });
  } catch (error) {
    console.error(error);
    return json(500, { error: 'AGENT_RUNNER_FAILED', message: error.message });
  }
};
