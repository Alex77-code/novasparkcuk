const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES = new Set(['OWNER','ADMIN','MANAGER']);
const MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

async function run(event) {
  const user = await verifyUser(event.headers?.authorization || event.headers?.Authorization);
  if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });

  const body = JSON.parse(event.body || '{}');
  const org = String(body.organization_id || '').trim();
  const message = String(body.message || '').trim();
  if (!org || !message) return json(400, { error: 'ORGANIZATION_AND_MESSAGE_REQUIRED' });

  const memberships = await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id || '')}&select=role&limit=1`);
  const role = String(memberships?.[0]?.role || user.role || 'VIEWER').toUpperCase();
  if (!ROLES.has(role)) return json(403, { error: 'CEO_ROLE_REQUIRED' });

  const stop = (await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop,automation_enabled&limit=1`))?.[0];
  const [orgRows, goals, tasks, leads, opportunities, campaigns, clients, payments, integrations, events] = await Promise.all([
    supabaseRequest(`organizations?id=eq.${encodeURIComponent(org)}&select=id,name,legal_name,timezone,currency&limit=1`),
    supabaseRequest(`goals?organization_id=eq.${encodeURIComponent(org)}&select=id,title,objective,target_value,target_currency,status,target_date&order=created_at.desc&limit=20`),
    supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,title,status,priority,risk,approval_required,goal_id,updated_at&order=priority.desc,updated_at.desc&limit=100`),
    supabaseRequest(`leads?organization_id=eq.${encodeURIComponent(org)}&select=id,name,company,source,stage,score,estimated_value,updated_at&order=updated_at.desc&limit=100`),
    supabaseRequest(`opportunities?organization_id=eq.${encodeURIComponent(org)}&select=id,stage,value,currency,probability,expected_close&order=created_at.desc&limit=100`),
    supabaseRequest(`campaigns?organization_id=eq.${encodeURIComponent(org)}&select=id,name,channel,status,budget,objective&order=created_at.desc&limit=50`),
    supabaseRequest(`clients?organization_id=eq.${encodeURIComponent(org)}&select=id,health_status,services&order=created_at.desc&limit=50`),
    supabaseRequest(`payments?organization_id=eq.${encodeURIComponent(org)}&select=id,amount,currency,status,confirmed_at&order=created_at.desc&limit=100`),
    supabaseRequest(`integrations?organization_id=eq.${encodeURIComponent(org)}&select=provider,status&order=provider.asc`),
    supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&select=event_type,source,created_at,payload&order=created_at.desc&limit=50`)
  ]);

  const context = {
    organization: orgRows?.[0] || { id: org },
    controls: { emergency_stop: Boolean(stop?.emergency_stop), automation_enabled: stop?.automation_enabled !== false },
    goals, tasks, leads, opportunities, campaigns, clients, payments, integrations,
    recent_events: events
  };

  const system = `You are NOVA CEO, the executive AI for NovaSpark Creative Ltd. Give concise, commercially useful decisions based only on the supplied company state. Never invent customers, revenue, leads, campaign performance, payments, integrations, or completed actions. Distinguish facts from recommendations. You may recommend low-risk internal work. External communication, ad spend, payments, contracts, publishing, account changes, or irreversible actions require owner approval. If data is missing, say so. Return plain text with: Executive Summary, What Matters Now, Recommended Actions, Risks/Approvals. Current model: ${MODEL}.`;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://novasparkcreative.com',
      'X-Title': process.env.OPENROUTER_SITE_NAME || 'NovaSpark Creative Ltd'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `COMPANY STATE:\n${JSON.stringify(context)}\n\nOWNER REQUEST:\n${message}` }
      ],
      temperature: 0.2
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const answer = raw.choices?.[0]?.message?.content || 'No executive response returned.';

  await supabaseRequest('events', { method: 'POST', body: JSON.stringify({ organization_id: org, event_type: 'AI_CEO_CHAT', source: 'ai-ceo-chat', payload: { user_id: user.id, message_length: message.length, provider: 'openrouter', model: MODEL } }) });
  return json(200, { ok: true, answer, model: MODEL, provider: 'openrouter', context: { controls: context.controls, counts: { goals: goals.length, tasks: tasks.length, leads: leads.length, opportunities: opportunities.length, campaigns: campaigns.length, clients: clients.length } }, external_actions: false });
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    if (!process.env.OPENROUTER_API_KEY) return json(503, { error: 'OPENROUTER_API_KEY_NOT_CONFIGURED', message: 'Set OPENROUTER_API_KEY in the server environment.' });
    return await run(event);
  } catch (e) {
    console.error(e);
    return json(500, { error: 'AI_CEO_CHAT_FAILED', message: e.message });
  }
};
module.exports.run = run;
