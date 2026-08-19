const { json, required, supabaseRequest, verifyUser } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.6-luna';
const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

async function runRevenueBrain(command = '') {
  const org = (await supabaseRequest('organizations?select=id,name,currency&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if (!org) throw new Error('NovaSpark organization is missing.');

  const goal = (await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,objective,target_value,target_currency,kpis,strategy,forecast&order=updated_at.desc&limit=1`))?.[0];
  if (!goal) throw new Error('No active CEO revenue goal exists.');

  const [revenue, pipeline, leads] = await Promise.all([
    supabaseRequest(`revenue_events?organization_id=eq.${org.id}&event_type=in.(PAYMENT,SALE,WON)&select=amount,currency,occurred_at&order=occurred_at.desc&limit=500`),
    supabaseRequest(`opportunities?organization_id=eq.${org.id}&stage=not.in.(LOST)&select=id,name,stage,amount,probability,service,expected_close_date&order=updated_at.desc&limit=500`),
    supabaseRequest(`leads?organization_id=eq.${org.id}&status=in.(NEW,QUALIFIED,CONTACTED,ENGAGED)&select=id,status,score,created_at&order=created_at.desc&limit=500`)
  ]);

  const target = Number(goal.target_value || 0);
  const currentRevenue = (revenue || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const activePipeline = (pipeline || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const weightedPipeline = (pipeline || []).reduce((s, x) => s + Number(x.amount || 0) * (Number(x.probability || 0) / 100), 0);
  const remaining = Math.max(0, target - currentRevenue);
  const avgDeal = (pipeline || []).filter(x => Number(x.amount) > 0).reduce((s, x) => s + Number(x.amount), 0) / Math.max(1, (pipeline || []).filter(x => Number(x.amount) > 0).length);
  const assumedDeal = avgDeal || 500;
  const requiredNewOpps = Math.max(0, Math.ceil((remaining - weightedPipeline) / assumedDeal));
  const recommendedLeads = Math.max(requiredNewOpps * 5, 10);

  const prompt = `You are NOVA REVENUE BRAIN for NovaSpark Creative Ltd. Create a practical execution strategy for the active CEO goal. Never claim revenue that is not present in the database. Do not guarantee sales. Return JSON only with {"status":"ON_TRACK|AT_RISK|OFF_TRACK|ACHIEVED","diagnosis":"","strategy":[{"agent_key":"","action_type":"","title":"","objective":"","priority":0,"target_count":0,"target_value":0,"approval_required":false}],"forecast":{"best_case":0,"base_case":0,"downside":0},"assumptions":[]}. Goal: ${JSON.stringify(goal)}. Command: ${command}. Current revenue: ${currentRevenue}. Active pipeline: ${activePipeline}. Weighted pipeline: ${weightedPipeline}. Remaining target: ${remaining}. Required new opportunities at assumed average deal ${assumedDeal}: ${requiredNewOpps}. Recommended leads: ${recommendedLeads}. Existing pipeline: ${JSON.stringify(pipeline)}. Active leads: ${JSON.stringify(leads)}. Generate actions only for NovaSpark's permitted internal agents. External communication, spending and final delivery must remain approval-gated.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
    body: JSON.stringify({ model: MODEL, input: prompt })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const output = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
  let plan; try { plan = JSON.parse(output); } catch { plan = { status: 'AT_RISK', diagnosis: 'Revenue Brain returned invalid structured output.', strategy: [], forecast: {}, assumptions: [] }; }

  const now = new Date();
  const end = new Date(now); end.setUTCMonth(end.getUTCMonth() + 1);
  const cycle = (await supabaseRequest('revenue_brain_cycles', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, goal_id: goal.id, period_start: now.toISOString().slice(0,10), period_end: end.toISOString().slice(0,10), target, current_revenue: currentRevenue, pipeline: activePipeline, weighted_pipeline: weightedPipeline, required_pipeline: remaining, required_new_opportunities: requiredNewOpps, recommended_leads: recommendedLeads, status: plan.status || 'PLANNING', strategy: plan, assumptions: { avg_deal: assumedDeal } }) }))?.[0];

  const actions = [];
  for (const action of Array.isArray(plan.strategy) ? plan.strategy.slice(0, 30) : []) {
    const row = (await supabaseRequest('revenue_brain_actions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, cycle_id: cycle.id, agent_key: String(action.agent_key || 'coo').slice(0,80), action_type: String(action.action_type || 'EXECUTE').slice(0,80), title: String(action.title || 'Revenue action').slice(0,240), objective: String(action.objective || '').slice(0,3000), priority: Number(action.priority || 50), target_value: Number(action.target_value || 0) || null, target_count: Number(action.target_count || 0) || null, status: 'QUEUED', approval_required: Boolean(action.approval_required), inputs: { goal_id: goal.id, command } }) }))?.[0];
    if (row) actions.push(row);
  }

  await supabaseRequest(`ceo_goals?id=eq.${goal.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ forecast: plan.forecast || {}, strategy: plan, updated_at: new Date().toISOString() }) });
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_REVENUE_BRAIN', action: 'REVENUE_PLAN_CREATED', resource_type: 'revenue_brain_cycle', resource_id: cycle.id, metadata: { target, currentRevenue, weightedPipeline, requiredNewOpps, recommendedLeads, status: plan.status } }) });

  return { goal, metrics: { target, currentRevenue, remaining, activePipeline, weightedPipeline, assumedDeal, requiredNewOpps, recommendedLeads }, cycle, actions, strategy: plan };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    if (process.env.NOVA_OWNER_EMAIL && user.email !== process.env.NOVA_OWNER_EMAIL) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });
    const body = JSON.parse(event.body || '{}');
    return json(200, await runRevenueBrain(String(body.command || '').slice(0, 2000)));
  } catch (e) { console.error(e); return json(500, { error: 'REVENUE_BRAIN_FAILED', message: e.message }); }
};

module.exports.runRevenueBrain = runRevenueBrain;
