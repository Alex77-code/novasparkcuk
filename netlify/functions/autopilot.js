const { supabaseRequest } = require('./_nova');
const { runAcquisition } = require('./acquisition');
const { buildDelivery } = require('./delivery');

exports.config = { schedule: '@hourly' };

async function processInbound(org) {
  const policy = (await supabaseRequest(`autonomy_policies?organization_id=eq.${org.id}&select=enabled,followups_enabled,outbound_requires_owner_approval&limit=1`))?.[0];
  if (policy && !policy.enabled) return { skipped: true, reason: 'AUTONOMY_DISABLED' };

  const inbound = await supabaseRequest(`inbound_leads?organization_id=eq.${org.id}&status=eq.NEW&select=id,name,email,company,website,service_interest,message&order=created_at.asc&limit=10`);
  const processed = [];
  for (const item of inbound || []) {
    try {
      let company = null;
      if (item.website) {
        const domain = String(item.website).replace(/^https?:\/\//,'').split('/')[0].toLowerCase();
        if (domain) company = (await supabaseRequest(`companies?organization_id=eq.${org.id}&domain=eq.${encodeURIComponent(domain)}&select=id,name&limit=1`))?.[0] || null;
        if (!company) company = (await supabaseRequest('companies',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,name:item.company,domain,website:item.website,source:'INBOUND_WEBSITE'})}))?.[0];
      }
      if (!company) company = (await supabaseRequest('companies',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,name:item.company,source:'INBOUND_WEBSITE'})}))?.[0];

      const lead = company ? (await supabaseRequest('leads',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,company_id:company.id,status:'NEW',score:100,source:'INBOUND_WEBSITE',qualification:{inbound_lead_id:item.id,service_interest:item.service_interest,message:item.message}})}))?.[0] : null;

      const body = `Hi ${item.name || 'there'},\n\nThanks for contacting NovaSpark Creative. We have received your enquiry from ${item.company}. NOVA has logged the requirements and our team will review the best next step.\n\nService interest: ${item.service_interest || 'Not specified'}\n\nRegards,\nNovaSpark Creative Ltd`;
      const approval = (await supabaseRequest('approvals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,risk:'MEDIUM',action:'INBOUND_LEAD_REPLY',payload:{inbound_lead_id:item.id,lead_id:lead?.id,company_id:company?.id,channel:'EMAIL',to:item.email,subject:'We received your NovaSpark enquiry',body},status:'PENDING'})}))?.[0];

      await supabaseRequest(`inbound_leads?id=eq.${item.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'QUALIFIED'})});
      processed.push({id:item.id,lead_id:lead?.id,approval_id:approval?.id});
    } catch (error) { processed.push({id:item.id,error:error.message}); }
  }
  return { processed };
}

exports.handler = async () => {
  const started = Date.now();
  let run;
  try {
    const org = (await supabaseRequest('organizations?select=id,name,timezone,currency&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
    if (!org) throw new Error('NovaSpark organization is missing.');
    const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,outbound_enabled,spending_enabled&limit=1`))?.[0];
    if (controls?.emergency_stop) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'EMERGENCY_STOP' }) };

    run = (await supabaseRequest('autonomy_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, mode: 'HOURLY_AUTOPILOT' }) }))?.[0];

    const inbound = await processInbound(org);
    const latest = (await supabaseRequest(`acquisition_runs?organization_id=eq.${org.id}&select=id,started_at&order=started_at.desc&limit=1`))?.[0];
    const stale = !latest || (Date.now() - Date.parse(latest.started_at)) > 6 * 60 * 60 * 1000;
    const acquisition = stale ? await runAcquisition('SCHEDULED_AUTOPILOT') : { skipped: true, reason: 'ACQUISITION_COOLDOWN' };

    const won = await supabaseRequest(`opportunities?organization_id=eq.${org.id}&stage=eq.WON&select=id,name,stage&order=updated_at.asc&limit=5`);
    const deliveries = [];
    for (const opportunity of won || []) {
      const existing = await supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&opportunity_id=eq.${opportunity.id}&select=id,status&limit=1`);
      if (existing?.[0]) continue;
      try { deliveries.push(await buildDelivery(opportunity.id, 'Autopilot: complete contracted work and place it in owner review before any external delivery.')); }
      catch (error) { deliveries.push({ opportunity_id: opportunity.id, error: error.message }); }
    }

    const summary = { inbound, acquisition, deliveries, duration_ms: Date.now() - started };
    await supabaseRequest(`autonomy_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'COMPLETED', summary, completed_at: new Date().toISOString() }) });
    await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_AUTOPILOT', action: 'HOURLY_AUTOPILOT_COMPLETED', resource_type: 'autonomy_run', resource_id: run.id, metadata: summary }) });
    return { statusCode: 200, body: JSON.stringify({ ok: true, summary }) };
  } catch (error) {
    console.error(error);
    try { if (run?.id) await supabaseRequest(`autonomy_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'FAILED', error: error.message, completed_at: new Date().toISOString() }) }); } catch {}
    return { statusCode: 500, body: JSON.stringify({ error: 'AUTOPILOT_FAILED', message: error.message }) };
  }
};
