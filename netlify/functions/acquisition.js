const { json, required, supabaseRequest, verifyUser } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.6-luna';

function orgQuery() {
  return 'organizations?select=id,name,timezone,currency&name=eq.NovaSpark%20Creative&limit=1';
}

async function runAcquisition(trigger, ownerCommand = '') {
  const org = (await supabaseRequest(orgQuery()))?.[0];
  if (!org) throw new Error('NovaSpark organization is missing.');

  const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,outbound_enabled,spending_enabled&limit=1`))?.[0];
  if (controls?.emergency_stop) return { skipped: true, reason: 'EMERGENCY_STOP' };

  const memory = await supabaseRequest(`memory?organization_id=eq.${org.id}&select=category,key,value,importance&order=importance.desc&limit=40`);
  const existing = await supabaseRequest(`companies?organization_id=eq.${org.id}&select=name,domain,industry,location,fit_score,marketing_score,estimated_deal_value&order=created_at.desc&limit=100`);

  const run = (await supabaseRequest('acquisition_runs', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ organization_id: org.id, trigger, target_profile: { ownerCommand, memory } })
  }))?.[0];

  const prompt = `You are NOVA PROSPECTOR for NovaSpark Creative Ltd, a UK digital marketing agency. Find legitimate B2B prospects using only public company-level information. Do not collect or infer sensitive personal data. Do not invent businesses, websites, metrics, emails or contact details. Prefer companies with an official website and an observable marketing opportunity. Return JSON only: {"prospects":[{"name":"","domain":"","website":"","industry":"","location":"","country":"","fit_score":0,"marketing_score":0,"estimated_deal_value":0,"reason":"","source_url":"","outreach_draft":{"subject":"","body":""}}]}. Do not include a personal email address unless it is clearly published for business contact on an official company website. Never claim a prospect has agreed to contact. Target profile: UK SMEs that could buy SEO, Google Ads, Meta Ads, websites/CRO, content or social media. Existing prospects to avoid: ${JSON.stringify(existing.slice(0,80))}. Company memory: ${JSON.stringify(memory)}. Owner command: ${ownerCommand || 'Find the next best compliant UK prospects for NovaSpark.'}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
    body: JSON.stringify({ model: MODEL, input: prompt, tools: [{ type: 'web_search' }] })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text}`);
  const raw = JSON.parse(text);
  const output = raw.output_text || raw.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
  let parsed;
  try { parsed = JSON.parse(output); } catch { parsed = { prospects: [] }; }

  const created = [];
  const drafts = [];
  for (const p of Array.isArray(parsed.prospects) ? parsed.prospects.slice(0, 20) : []) {
    const name = String(p.name || '').trim();
    const domain = String(p.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!name || !domain) continue;
    const dup = await supabaseRequest(`companies?organization_id=eq.${org.id}&domain=eq.${encodeURIComponent(domain)}&select=id,name,domain&limit=1`);
    if (dup?.[0]) continue;
    const company = (await supabaseRequest('companies', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ organization_id: org.id, name: name.slice(0,240), domain, website: p.website || `https://${domain}`, industry: p.industry || null, location: p.location || null, country: p.country || 'United Kingdom', fit_score: Number(p.fit_score) || 0, marketing_score: Number(p.marketing_score) || 0, estimated_deal_value: Number(p.estimated_deal_value) || null, source: 'NOVA_PUBLIC_WEB_RESEARCH', metadata: { reason: p.reason || null, source_url: p.source_url || null } })
    }))?.[0];
    if (!company) continue;
    const lead = (await supabaseRequest('leads', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ organization_id: org.id, company_id: company.id, status: 'NEW', score: Number(p.fit_score || 0) * 0.6 + Number(p.marketing_score || 0) * 0.4, source: 'NOVA_PUBLIC_WEB_RESEARCH', qualification: { reason: p.reason || null, source_url: p.source_url || null } })
    }))?.[0];
    created.push(company);

    if (lead && p.outreach_draft?.body) {
      const approval = (await supabaseRequest('approvals', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ organization_id: org.id, lead_id: lead.id, risk: 'MEDIUM', action: 'OUTBOUND_CONTACT_DRAFT', payload: { channel: 'EMAIL', company_id: company.id, subject: String(p.outreach_draft.subject || '').slice(0,240), body: String(p.outreach_draft.body || '').slice(0,6000), source_url: p.source_url || null, reason: p.reason || null }, status: 'PENDING' })
      }))?.[0];
      drafts.push(approval);
    }
  }

  const report = { trigger, model: MODEL, discovered: Array.isArray(parsed.prospects) ? parsed.prospects.length : 0, created: created.length, outreachDraftsAwaitingOwnerApproval: drafts.length, outboundSent: 0 };
  await supabaseRequest(`acquisition_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ discovered_count: report.discovered, qualified_count: created.length, draft_outreach_count: drafts.length, status: 'COMPLETED', report, completed_at: new Date().toISOString() }) });
  await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_PROSPECTOR', action: 'AUTONOMOUS_ACQUISITION_RUN', resource_type: 'acquisition_run', resource_id: run.id, metadata: report }) });
  return { ok: true, report, prospects: created, approvals: drafts, outboundEnabled: Boolean(controls?.outbound_enabled) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    if (process.env.NOVA_OWNER_EMAIL && user.email !== process.env.NOVA_OWNER_EMAIL) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });
    const body = JSON.parse(event.body || '{}');
    return json(200, await runAcquisition('OWNER_COMMAND', String(body.command || '').slice(0, 2000)));
  } catch (e) {
    console.error(e);
    return json(500, { error: 'ACQUISITION_FAILED', message: e.message });
  }
};

module.exports.runAcquisition = runAcquisition;
