const { supabaseRequest, required } = require('./_nova');
const { runAcquisition } = require('./acquisition');
const { buildDelivery } = require('./delivery');

exports.config = { schedule: '@hourly' };

exports.handler = async () => {
  const started = Date.now();
  let run;
  try {
    const org = (await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
    if (!org) throw new Error('NovaSpark organization is missing.');
    const controls = (await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
    if (controls?.emergency_stop) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'EMERGENCY_STOP' }) };

    run = (await supabaseRequest('autonomy_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: org.id, mode: 'HOURLY_AUTOPILOT' }) }))?.[0];

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

    const summary = { acquisition, deliveries, duration_ms: Date.now() - started };
    await supabaseRequest(`autonomy_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'COMPLETED', summary, completed_at: new Date().toISOString() }) });
    await supabaseRequest('audit_logs', { method: 'POST', body: JSON.stringify({ organization_id: org.id, actor_type: 'NOVA_AUTOPILOT', action: 'HOURLY_AUTOPILOT_COMPLETED', resource_type: 'autonomy_run', resource_id: run.id, metadata: summary }) });
    return { statusCode: 200, body: JSON.stringify({ ok: true, summary }) };
  } catch (error) {
    console.error(error);
    try {
      if (run?.id) await supabaseRequest(`autonomy_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'FAILED', error: error.message, completed_at: new Date().toISOString() }) });
    } catch {}
    return { statusCode: 500, body: JSON.stringify({ error: 'AUTOPILOT_FAILED', message: error.message }) };
  }
};
