const { json, supabaseRequest, verifyUser } = require('./_nova');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers?.authorization || event.headers?.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    const b = JSON.parse(event.body || '{}');
    const org = String(b.organization_id || '').trim();
    if (!org) return json(400, { error: 'ORGANIZATION_ID_REQUIRED' });
    const memberships = await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id || '')}&select=role&limit=1`);
    const role = String(memberships?.[0]?.role || '').toUpperCase();
    if (!['OWNER','ADMIN','MANAGER'].includes(role)) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });
    const controls = await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop,automation_enabled,outbound_enabled,spending_enabled&limit=1`);
    const events = await supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&select=event_type,created_at&order=created_at.desc&limit=10`);
    const tasks = await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=status&limit=1000`);
    return json(200, { ok: true, health: { auth: 'online', database: 'reachable', emergency_stop: Boolean(controls?.[0]?.emergency_stop), automation_enabled: controls?.[0]?.automation_enabled !== false, outbound_enabled: Boolean(controls?.[0]?.outbound_enabled), spending_enabled: Boolean(controls?.[0]?.spending_enabled), queued_tasks: (tasks || []).filter(t => ['PLANNED','PENDING'].includes(t.status)).length, recent_events: Array.isArray(events) ? events : [] } });
  } catch (e) { console.error(e); return json(500, { error: 'SYSTEM_HEALTH_FAILED', message: e.message }); }
};
