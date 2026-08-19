const { json, supabaseRequest } = require('./_nova');

function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const body = JSON.parse(event.body || '{}');
    if (clean(body.website_field, 100)) return json(200, { ok: true }); // honeypot
    const email = clean(body.email, 320).toLowerCase();
    const company = clean(body.company, 240);
    if (!email || !validEmail(email) || !company) return json(400, { error: 'VALIDATION_FAILED' });

    const org = (await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
    if (!org) return json(500, { error: 'ORGANIZATION_NOT_CONFIGURED' });

    const lead = (await supabaseRequest('inbound_leads', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: org.id,
        name: clean(body.name, 240),
        email,
        company,
        website: clean(body.website, 500),
        service_interest: clean(body.service_interest, 240),
        message: clean(body.message, 5000),
        source: clean(body.source, 80) || 'WEBSITE',
        metadata: { user_agent: event.headers?.['user-agent'] || null }
      })
    }))?.[0];

    await supabaseRequest('events', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: org.id,
        event_type: 'INBOUND_LEAD_RECEIVED',
        source: 'WEBSITE',
        payload: { inbound_lead_id: lead?.id, company, email }
      })
    });

    return json(200, { ok: true, lead_id: lead?.id });
  } catch (error) {
    console.error(error);
    return json(500, { error: 'INBOUND_LEAD_FAILED' });
  }
};
