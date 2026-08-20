const { json, supabaseRequest, verifyUser } = require('./_nova');
const OWNER_EMAIL = 'novasparkcreative@gmail.com';
const OWNER_ROLES = new Set(['OWNER','ADMIN']);
const CANONICAL_ORG = '7199c975-b5c7-4aaa-a7e9-20960b18c058';

async function run(event) {
  const user = await verifyUser(event.headers?.authorization || event.headers?.Authorization);
  if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
  if (String(user.email || '').toLowerCase() !== OWNER_EMAIL) return json(403, { error: 'OWNER_EMAIL_NOT_ALLOWED' });
  const body = JSON.parse(event.body || '{}');
  const requested = String(body.organization_id || '').trim();
  const org = requested || CANONICAL_ORG;
  if (org !== CANONICAL_ORG) return json(403, { error: 'ORGANIZATION_ACCESS_DENIED' });

  let memberships = await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id || '')}&select=organization_id,role&limit=1`);
  if (!memberships?.length) {
    await supabaseRequest('organization_members', { method: 'POST', body: JSON.stringify({ organization_id: org, user_id: user.id, role: 'owner' }) });
    memberships = [{ organization_id: org, role: 'owner' }];
  }
  const membership = memberships[0];
  if (!membership || !OWNER_ROLES.has(String(membership.role || '').toUpperCase())) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });
  return json(200, { ok: true, authorized: true, user_id: user.id, email: OWNER_EMAIL, organization_id: org, role: membership.role, session_policy: 'SERVER_VERIFIED', sensitive_actions: 'EXPLICIT_APPROVAL_REQUIRED' });
}
exports.handler = async event => { if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' }); try { return await run(event); } catch (e) { console.error(e); return json(500, { error: 'OWNER_AUTH_GATE_FAILED', message: e.message }); } };
module.exports.run = run;
