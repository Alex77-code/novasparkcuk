const { json, supabaseRequest, verifyUser } = require('./_nova');

exports.handler = async (event) => {
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    if (process.env.NOVA_OWNER_EMAIL && user.email !== process.env.NOVA_OWNER_EMAIL) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });
    const orgs = await supabaseRequest('organizations?select=id,name,legal_name,timezone,currency&name=eq.NovaSpark%20Creative&limit=1');
    if (!orgs?.[0]) return json(404, { error: 'ORGANIZATION_NOT_FOUND' });
    const org = orgs[0];
    const [agents,tasks,controls,integrations,goals,health] = await Promise.all([
      supabaseRequest(`agents?organization_id=eq.${org.id}&select=id,key,name,role,status,metrics&order=name.asc`),
      supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,title,status,priority,risk,approval_required,deadline,agent_id&order=created_at.desc&limit=100`),
      supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,outbound_enabled,spending_enabled&limit=1`),
      supabaseRequest(`integrations?organization_id=eq.${org.id}&select=provider,status&order=provider.asc`),
      supabaseRequest(`goals?organization_id=eq.${org.id}&select=id,title,objective,target_value,target_currency,forecast,status&order=created_at.desc&limit=20`),
      supabaseRequest(`system_health?organization_id=eq.${org.id}&select=component,status,latency_ms,error,checked_at&order=component.asc`)
    ]);
    return json(200,{ok:true,org,agents,tasks,controls:controls?.[0]||null,integrations,goals,health});
  } catch(error){ console.error(error); return json(500,{error:'STATE_LOAD_FAILED',message:error.message}); }
};
