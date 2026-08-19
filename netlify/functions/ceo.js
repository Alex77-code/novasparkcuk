const { json, required, supabaseRequest, verifyUser } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.4';

const SYSTEM = `You are NOVA CEO, the central operating intelligence of NovaSpark Creative Ltd.
You operate a real business operating system. Never invent revenue, customers, leads, analytics, campaign results, payments, or API results.
Convert owner objectives into an executable plan using only supplied data. Clearly distinguish REAL DATA, ESTIMATE, TARGET, FORECAST, and ACTION REQUIRED.
Respect approvals: low-risk planning and internal analysis can proceed; medium/high-risk spending, financial transactions, contracts, destructive changes and sensitive outbound actions require owner approval.
Never create unrestricted spam or violate platform policies or privacy law.
Return concise JSON with keys: intent, summary, target, current, gap, forecast, probability, strategy, projects, tasks, approvals, risks, next_actions.
projects is an array of {name, objective, priority}. tasks is an array of {title, description, agent_key, priority, risk, approval_required}.`;

async function getOrg() {
  const rows = await supabaseRequest('organizations?select=id,name,legal_name,timezone,currency&name=eq.NovaSpark%20Creative&limit=1');
  if (!rows?.[0]) throw new Error('NovaSpark organization is missing. Run the Supabase migration first.');
  return rows[0];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    if (process.env.NOVA_OWNER_EMAIL && user.email !== process.env.NOVA_OWNER_EMAIL) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });

    const body = JSON.parse(event.body || '{}');
    const command = String(body.command || '').trim();
    if (!command) return json(400, { error: 'COMMAND_REQUIRED' });
    if (command.length > 4000) return json(413, { error: 'COMMAND_TOO_LARGE' });

    const org = await getOrg();
    const [goals, tasks, agents, controls, memory, integrations, opportunities, payments, campaigns] = await Promise.all([
      supabaseRequest(`goals?organization_id=eq.${org.id}&select=id,title,objective,target_value,target_currency,status,forecast&order=created_at.desc&limit=20`),
      supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,title,status,priority,risk,approval_required,deadline,agent_id&order=created_at.desc&limit=50`),
      supabaseRequest(`agents?organization_id=eq.${org.id}&select=id,key,name,role,status,metrics&order=name.asc`),
      supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,outbound_enabled,spending_enabled,automation_enabled&limit=1`),
      supabaseRequest(`memory?organization_id=eq.${org.id}&select=category,key,value,importance&order=importance.desc&limit=50`),
      supabaseRequest(`integrations?organization_id=eq.${org.id}&select=provider,status,metadata&order=provider.asc`),
      supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=id,stage,amount,currency,probability,expected_close_date&order=created_at.desc&limit=50`),
      supabaseRequest(`payments?organization_id=eq.${org.id}&select=id,amount,currency,status,confirmed_at&order=created_at.desc&limit=50`),
      supabaseRequest(`campaigns?organization_id=eq.${org.id}&select=id,name,channel,status,budget,objective&order=created_at.desc&limit=20`)
    ]);

    if (controls?.[0]?.emergency_stop) return json(423, { error: 'EMERGENCY_STOP_ACTIVE' });

    const context = { organization: org, controls: controls?.[0] || null, goals, tasks, agents, memory, integrations, opportunities, payments, campaigns };
    const prompt = `${SYSTEM}\n\nCURRENT COMPANY STATE:\n${JSON.stringify(context)}\n\nOWNER COMMAND:\n${command}`;

    const started = Date.now();
    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
      body: JSON.stringify({ model: MODEL, input: prompt })
    });
    const aiText = await aiResponse.text();
    if (!aiResponse.ok) throw new Error(`OpenAI ${aiResponse.status}: ${aiText}`);
    const raw = JSON.parse(aiText);
    const outputText = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';

    let plan;
    try { plan = JSON.parse(outputText); } catch { plan = { intent: 'analysis', summary: outputText, projects: [], tasks: [], approvals: [], risks: [], next_actions: [] }; }

    let goal = null;
    if (plan.target !== undefined || plan.intent || plan.strategy) {
      const goalRows = await supabaseRequest('goals', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ organization_id: org.id, title: String(plan.intent || 'CEO Objective').slice(0, 200), objective: command, target_value: typeof plan.target === 'number' ? plan.target : null, target_currency: org.currency, kpis: [], strategy: { summary: plan.strategy || null }, forecast: plan.forecast || {} })
      });
      goal = goalRows?.[0] || null;
    }

    const createdProjects = [];
    for (const project of Array.isArray(plan.projects) ? plan.projects.slice(0, 20) : []) {
      const rows = await supabaseRequest('projects', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, goal_id: goal?.id || null, name: String(project.name || 'CEO Project').slice(0, 240), description: String(project.objective || '').slice(0, 4000), status: 'PLANNED', metadata: { priority: project.priority || 50, source: 'NOVA_CEO' } }) });
      if (rows?.[0]) createdProjects.push(rows[0]);
    }

    const createdTasks = [];
    for (const task of Array.isArray(plan.tasks) ? plan.tasks.slice(0, 40) : []) {
      const agent = agents.find(a => a.key === task.agent_key);
      const risk = ['LOW','MEDIUM','HIGH'].includes(task.risk) ? task.risk : 'LOW';
      const approval = Boolean(task.approval_required || risk !== 'LOW');
      const rows = await supabaseRequest('tasks', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ organization_id: org.id, goal_id: goal?.id || null, project_id: createdProjects[0]?.id || null, agent_id: agent?.id || null, title: String(task.title || 'Untitled task').slice(0, 240), description: String(task.description || '').slice(0, 4000), priority: Number.isFinite(task.priority) ? Math.max(0, Math.min(100, task.priority)) : 50, risk, approval_required: approval, status: approval ? 'WAITING_APPROVAL' : 'PLANNED', inputs: { source: 'NOVA_CEO', command } })
      });
      if (rows?.[0]) createdTasks.push(rows[0]);
    }

    await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'OWNER_CEO', actor_id: user.id, action: 'CEO_COMMAND_EXECUTED', entity_type: 'goal', entity_id: goal?.id || null, status: 'COMPLETED', details: { command, model: MODEL, duration_ms: Date.now() - started, project_count: createdProjects.length, task_count: createdTasks.length } }) });

    return json(200, { ok: true, plan, goal, projects: createdProjects, tasks: createdTasks, model: MODEL });
  } catch (error) {
    console.error(error);
    return json(500, { error: 'CEO_EXECUTION_FAILED', message: error.message });
  }
};
