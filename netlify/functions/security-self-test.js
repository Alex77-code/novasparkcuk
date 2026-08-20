const { json } = require('./_nova');
const { requireOwner } = require('./_owner-guard');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const body = JSON.parse(event.body || '{}');
    const gate = await requireOwner(event, body.organization_id);
    if (!gate.ok) return gate.response;
    return json(200, {
      ok: true,
      test: 'OWNER_SECURITY_SELF_TEST',
      checks: {
        authenticated_session: true,
        owner_email: true,
        organization_access: true,
        owner_role: true,
        emergency_stop_clear: true
      },
      execution: 'NOT_PERFORMED',
      message: 'Security preflight passed. No external action was executed.'
    });
  } catch (e) {
    console.error('security-self-test', e);
    return json(500, { error: 'SECURITY_SELF_TEST_FAILED' });
  }
};