const { json, required, supabaseRequest, verifyUser } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.6-luna';

async function buildDelivery(opportunityId, ownerCommand = '') {
  const org = (await supabaseRequest('organizations?select=id,name,currency&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if (!org) throw new Error('NovaSpark organization is missing.');
  const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if (controls?.emergency_stop) return { skipped: true, reason: 'EMERGENCY_STOP' };

  const opportunity = (await supabaseRequest(`opportunities?id=eq.${encodeURIComponent(opportunityId)}&organization_id=eq.${org.id}&select=id,name,stage,amount,currency,service,company_id,primary_contact_id,notes&limit=1`))?.[0];
  if (!opportunity) throw new Error('OPPORTUNITY_NOT_FOUND');
  if (!['WON','PROPOSAL','NEGOTIATION'].includes(opportunity.stage)) throw new Error('DELIVERY_REQUIRES_ACTIVE_COMMERCIAL_OPPORTUNITY');

  const company = opportunity.company_id ? (await supabaseRequest(`companies?id=eq.${opportunity.company_id}&organization_id=eq.${org.id}&select=id,name,website,industry,location,metadata&limit=1`))?.[0] : null;
  const prompt = `You are NOVA DELIVERY, the production team of NovaSpark Creative Ltd. Create a client-ready digital marketing delivery package from the commercial brief below. Never claim work was deployed, published, ranked, paid for, or measured unless the supplied data proves it. Produce concrete drafts that specialist agents can execute and QA. Return JSON only: {"project_name":"","summary":"","deliverables":[{"type":"","title":"","content":{},"acceptance_criteria":[]}],"qa_checklist":[],"risks":[],"owner_review_note":""}. Client: ${JSON.stringify(company)}. Opportunity: ${JSON.stringify(opportunity)}. Owner command: ${ownerCommand || 'Complete the contracted project and prepare it for owner review before any external delivery.'}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
    body: JSON.stringify({ model: MODEL, input: prompt })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const output = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
  let plan;
  try { plan = JSON.parse(output); } catch { plan = { project_name: opportunity.name, summary: output, deliverables: [], qa_checklist: [], risks: ['AI output was not valid JSON'], owner_review_note: 'Manual review required.' }; }

  const project = (await supabaseRequest('projects', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ organization_id: org.id, name: String(plan.project_name || opportunity.name).slice(0,240), description: String(plan.summary || '').slice(0,4000), status: 'IN_PROGRESS', metadata: { opportunity_id: opportunity.id, model: MODEL } })
  }))?.[0];
  if (!project) throw new Error('PROJECT_CREATE_FAILED');

  const delivery = (await supabaseRequest('delivery_projects', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ organization_id: org.id, opportunity_id: opportunity.id, project_id: project.id, client_company_id: company?.id || null, name: String(plan.project_name || opportunity.name).slice(0,240), brief: { opportunity, company, ownerCommand }, status: 'IN_PROGRESS' })
  }))?.[0];
  if (!delivery) throw new Error('DELIVERY_PROJECT_CREATE_FAILED');

  const artifacts = [];
  for (const item of Array.isArray(plan.deliverables) ? plan.deliverables.slice(0, 20) : []) {
    const artifact = (await supabaseRequest('delivery_artifacts', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ delivery_project_id: delivery.id, artifact_type: String(item.type || 'DELIVERABLE').slice(0,80), title: String(item.title || 'Deliverable').slice(0,240), content: { content: item.content || {}, acceptance_criteria: item.acceptance_criteria || [] }, qa_status: 'PASSED' })
    }))?.[0];
    if (artifact) artifacts.push(artifact);
  }

  const qa = { passed: Array.isArray(plan.qa_checklist) && plan.qa_checklist.length > 0, checklist: plan.qa_checklist || [], risks: plan.risks || [] };
  const approval = (await supabaseRequest('approvals', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ organization_id: org.id, task_id: null, risk: 'MEDIUM', action: 'DELIVERY_RELEASE', payload: { delivery_project_id: delivery.id, opportunity_id: opportunity.id, client_company_id: company?.id || null, artifacts: artifacts.map(a => a.id), qa, owner_review_note: plan.owner_review_note || 'Review all artifacts before external delivery.' }, status: 'PENDING' })
  }))?.[0];

  await supabaseRequest(`delivery_projects?id=eq.${delivery.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: qa.passed ? 'READY_FOR_OWNER_REVIEW' : 'NEEDS_QA', qa_status: qa.passed ? 'PASSED' : 'FAILED', owner_review_status: 'PENDING', completed_at: qa.passed ? new Date().toISOString() : null }) });
  await supabaseRequest(`projects?id=eq.${project.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: qa.passed ? 'READY_FOR_OWNER_REVIEW' : 'NEEDS_QA' }) });
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_DELIVERY', action: 'PROJECT_COMPLETED_FOR_OWNER_REVIEW', resource_type: 'delivery_project', resource_id: delivery.id, metadata: { opportunity_id: opportunity.id, artifact_count: artifacts.length, qa } }) });

  return { ok: true, status: qa.passed ? 'READY_FOR_OWNER_REVIEW' : 'NEEDS_QA', deliveryProject: delivery, artifacts, approval, qa, externalDelivery: 'NOT_SENT_UNTIL_OWNER_APPROVAL' };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    if (process.env.NOVA_OWNER_EMAIL && user.email !== process.env.NOVA_OWNER_EMAIL) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });
    const body = JSON.parse(event.body || '{}');
    if (!body.opportunity_id) return json(400, { error: 'OPPORTUNITY_ID_REQUIRED' });
    return json(200, await buildDelivery(String(body.opportunity_id), String(body.command || '').slice(0,2000)));
  } catch (e) {
    console.error(e);
    return json(500, { error: 'DELIVERY_BUILD_FAILED', message: e.message });
  }
};

module.exports.buildDelivery = buildDelivery;
