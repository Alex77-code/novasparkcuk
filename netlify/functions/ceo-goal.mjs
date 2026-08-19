const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function parseGoal(text) {
  const amountMatch = text.match(/(?:£|GBP\s*)([0-9][0-9,]*(?:\.\d+)?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null;
  const month = text.match(/(?:next|this)\s+month/i) ? 'next_month' : null;
  const targetDate = month === 'next_month' ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 2, 0)).toISOString().slice(0, 10) : null;
  return { amount, currency: amount ? 'GBP' : null, targetDate };
}

async function sb(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function planWithAI(goalText, parsed) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = process.env.NOVA_AI_MODEL || 'gpt-5.6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input: `You are NOVA CEO for NovaSpark Creative Ltd. Turn this owner goal into a realistic autonomous operating plan. Goal: ${goalText}. Parsed target: ${JSON.stringify(parsed)}. Return JSON only with keys: strategy_summary, assumptions, kpis, tasks. tasks must be an array of objects with agent_name, task_type, title, instructions, priority, requires_approval. Never promise revenue; create measurable execution tasks. External outreach, spending, contracts, payments and final client delivery require owner approval.`,
      text: { format: { type: 'json_object' } }
    })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const output = data.output_text || data.output?.map(x => x.content?.map(c => c.text || '').join('')).join('') || '{}';
  return JSON.parse(output);
}

function fallbackPlan(goalText, parsed) {
  return {
    strategy_summary: 'Build qualified pipeline first, convert the highest-fit opportunities, then deliver contracted work with QA and owner release control.',
    assumptions: ['Revenue is not guaranteed.', 'Only verified business activity counts as revenue.', 'External communications and final delivery require owner approval.'],
    kpis: ['qualified_leads', 'pipeline_value', 'weighted_pipeline', 'proposals_sent', 'won_revenue', 'delivery_completion'],
    tasks: [
      { agent_name: 'NOVA_PROSPECTOR', task_type: 'acquisition', title: 'Find qualified UK prospects', instructions: `Research public company information for businesses that fit NovaSpark services and create evidence-backed prospects. Goal: ${goalText}`, priority: 100, requires_approval: false },
      { agent_name: 'NOVA_CRO', task_type: 'qualification', title: 'Score and qualify prospects', instructions: 'Score prospects for fit, intent, budget likelihood and service need; remove duplicates and suppressed records.', priority: 95, requires_approval: false },
      { agent_name: 'NOVA_OUTREACH', task_type: 'outreach_draft', title: 'Prepare personalized outreach', instructions: 'Create compliant, personalized outreach drafts for qualified prospects. Queue drafts; do not send without owner approval.', priority: 90, requires_approval: true },
      { agent_name: 'NOVA_SALES', task_type: 'pipeline', title: 'Advance qualified opportunities', instructions: 'Track replies, meetings, proposals and next actions. Never fabricate customer responses or deal stages.', priority: 85, requires_approval: false },
      { agent_name: 'NOVA_DELIVERY', task_type: 'delivery', title: 'Prepare contracted client delivery', instructions: 'For won/active projects, create deliverables, QA them and queue final release for owner approval.', priority: 80, requires_approval: true },
      { agent_name: 'NOVA_CFO', task_type: 'forecast', title: 'Update revenue forecast', instructions: 'Calculate actual revenue, pipeline and weighted forecast from recorded business events.', priority: 75, requires_approval: false }
    ]
  };
}

export default async (req) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'POST required' });
  const secret = process.env.NOVA_AUTOPILOT_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return json(401, { error: 'Unauthorized' });
  try {
    const body = JSON.parse(req.body || '{}');
    const goalText = String(body.goal || '').trim();
    if (!goalText) return json(400, { error: 'goal is required' });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' });

    const parsed = parseGoal(goalText);
    const plan = (await planWithAI(goalText, parsed)) || fallbackPlan(goalText, parsed);
    const ownerId = body.owner_id || null;
    const goalRows = await sb('ceo_goals', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ owner_id: ownerId, title: body.title || goalText.slice(0, 120), natural_language_goal: goalText, target_amount: parsed.amount, currency: parsed.currency || 'GBP', target_date: parsed.targetDate, strategy: plan, status: 'active' })
    });
    const goal = goalRows[0];
    const planRows = await sb('ceo_execution_plans', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ goal_id: goal.id, version: 1, status: 'active', plan, rationale: plan.strategy_summary })
    });
    const executionPlan = planRows[0];
    const tasks = (plan.tasks || []).map(t => ({ goal_id: goal.id, plan_id: executionPlan.id, agent_name: t.agent_name, task_type: t.task_type, title: t.title, instructions: t.instructions, priority: Number(t.priority || 50), requires_approval: Boolean(t.requires_approval) }));
    if (tasks.length) await sb('ceo_tasks', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(tasks) });
    return json(201, { ok: true, goal_id: goal.id, plan_id: executionPlan.id, tasks_created: tasks.length, target: parsed, plan });
  } catch (error) {
    return json(500, { error: error.message });
  }
};