const { json, supabaseRequest, verifyUser } = require('./_nova');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const user = await verifyUser(event.headers?.authorization || event.headers?.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    const body = JSON.parse(event.body || '{}');
    const org = String(body.organization_id || '').trim();
    if (!org) return json(400, { error: 'ORGANIZATION_ID_REQUIRED' });
    const memberships = await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id || '')}&select=role&limit=1`);
    const role = String(memberships?.[0]?.role || '').toUpperCase();
    if (!['OWNER','ADMIN','MANAGER'].includes(role)) return json(403, { error: 'AUDIT_ROLE_REQUIRED' });
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
    const rows = await supabaseRequest(`audit_logs?organization_id=eq.${encodeURIComponent(org)}&select=id,actor_type,action,entity_type,entity_id,status,metadata,details,created_at&order=created_at.desc&limit=${limit}`);
    return json(200, { ok: true, events: Array.isArray(rows) ? rows : [] });
  } catch (e) { console.error(e); return json(500, { error: 'AUDIT_LOG_FAILED', message: e.message }); }
};
