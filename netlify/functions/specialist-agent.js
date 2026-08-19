const { json, supabaseRequest, verifyUser } = require('./_nova');

const SPECIALISTS = {
  PROSPECTOR: { agentKey: 'prospector', prompt: 'Research permitted public company-level prospects and identify evidence-backed opportunities. Never invent businesses or personal data.' },
  LEADGEN: { agentKey: 'leadgen', prompt: 'Score and qualify existing leads using fit, marketing need, intent and available evidence.' },
  SALES: { agentKey: 'sales', prompt: 'Advance qualified opportunities, define next actions, and prepare proposal strategy. Never claim a deal is won without real evidence.' },
  CMO: { agentKey: 'cmo', prompt: 'Create measurable marketing actions for acquisition, SEO, content, social and campaigns.' },
  SEO: { agentKey: 'seo', prompt: 'Create technical/content/local SEO actions with measurable acceptance criteria.' },
  CONTENT: { agentKey: 'content', prompt: 'Create client-ready content plans and drafts aligned with the approved brief.' },
  ANALYTICS: { agentKey: 'analytics', prompt: 'Analyse available business metrics and return evidence-based insights and KPI recommendations.' },
  DELIVERY: { agentKey: 'delivery', prompt: 'Turn approved client project briefs into concrete deliverables and QA checklists. Do not release externally.' }
};

async function runSpecialist(agentName, task) {
  const config = SPECIALISTS[String(agentName || '').toUpperCase()];
  if (!config) throw new Error('Unsupported specialist agent');
  const org = (await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if (!org) throw new Error('NovaSpark organization not found');
  const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if (controls?.emergency_stop) return { skipped: true, reason: 'EMERGENCY_STOP' };

  const system = `You are ${agentName} specialist for NovaSpark Creative Ltd. ${config.prompt} Return concise JSON with: summary, actions (array), deliverables (array), risks (array), next_action. Do not fabricate facts, customers, revenue, approvals or completed external actions.`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.NOVA_AI_MODEL || 'gpt-5.6-luna', input: `${system}\n\nTask:\n${JSON.stringify(task)}` }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`AI ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const output = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '{}';
  let result; try { result = JSON.parse(output); } catch { result = { summary: output, actions: [], deliverables: [], risks: ['AI returned non-JSON output'], next_action: null }; }

  await supabaseRequest('agent_runs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, provider: 'openai', model: process.env.NOVA_AI_MODEL || 'gpt-5.6-luna', input: { agent: agentName, task }, output: result, status: 'COMPLETED' }) });
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'SPECIALIST_AGENT', actor_id: config.agentKey, action: 'SPECIALIST_EXECUTION', resource_type: 'agent_task', metadata: { agent: agentName, task, result } }) });
  return { ok: true, agent: agentName, result };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    const body = JSON.parse(event.body || '{}');
    return json(200, await runSpecialist(body.agent, body.task || {}));
  } catch (e) { console.error(e); return json(500, { error: 'SPECIALIST_FAILED', message: e.message }); }
};

module.exports.runSpecialist = runSpecialist;
