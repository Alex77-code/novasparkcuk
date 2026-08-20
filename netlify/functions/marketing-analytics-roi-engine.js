const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES = new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','MARKETING','ANALYST']);

async function run(event) {
  const user = await verifyUser(event.headers?.authorization || event.headers?.Authorization);
  if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
  const body = JSON.parse(event.body || '{}');
  const org = String(body.organization_id || '').trim();
  if (!org) return json(400, { error: 'ORGANIZATION_REQUIRED' });
  const memberships = await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id || '')}&select=role&limit=1`);
  const role = String(memberships?.[0]?.role || 'VIEWER').toUpperCase();
  if (!ROLES.has(role)) return json(403, { error: 'ANALYTICS_ROLE_REQUIRED' });
  const stop = (await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];
  if (stop?.emergency_stop) return json(200, { skipped: true, reason: 'EMERGENCY_STOP' });
  const [campaigns, leads, payments] = await Promise.all([
    supabaseRequest(`campaigns?organization_id=eq.${encodeURIComponent(org)}&select=id,name,channel,status,budget&limit=1000`),
    supabaseRequest(`leads?organization_id=eq.${encodeURIComponent(org)}&select=id,stage&limit=5000`),
    supabaseRequest(`payments?organization_id=eq.${encodeURIComponent(org)}&select=id,amount,currency,status&limit=5000`)
  ]);
  const sum = (rows, key) => (rows || []).reduce((n, r) => n + (Number(r[key]) || 0), 0);
  const spend = sum(campaigns, 'budget');
  const revenue = (payments || []).filter(p => ['PAID','SUCCEEDED','COMPLETED','CONFIRMED'].includes(String(p.status).toUpperCase())).reduce((n,p) => n + (Number(p.amount)||0), 0);
  const won = (leads || []).filter(x => String(x.stage).toUpperCase() === 'WON').length;
  const totalLeads = (leads || []).length;
  const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : null;
  const roas = spend > 0 ? revenue / spend : null;
  const byChannel = {};
  for (const c of campaigns || []) {
    const ch = String(c.channel || 'UNKNOWN').toUpperCase();
    byChannel[ch] ??= { campaigns: 0, budget: 0 };
    byChannel[ch].campaigns++;
    byChannel[ch].budget += Number(c.budget) || 0;
  }
  return json(200, { ok: true, analytics: { campaigns: { total: (campaigns || []).length, active: (campaigns || []).filter(x => String(x.status).toUpperCase() === 'ACTIVE').length }, leads: { total: totalLeads, won, conversion_rate: totalLeads ? won / totalLeads * 100 : 0 }, finance: { spend, revenue, profit: revenue - spend, roi_percent: roi, roas }, by_channel: byChannel, generated_at: new Date().toISOString() } });
}
exports.handler = async event => { if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' }); try { return await run(event); } catch (e) { console.error(e); return json(500, { error: 'MARKETING_ANALYTICS_FAILED', message: e.message }); } };
module.exports.run = run;
