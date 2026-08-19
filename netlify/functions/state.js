const { json, supabaseRequest, verifyUser } = require('./_nova');

exports.handler = async (event) => {
  try {
    const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
    if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });
    if (process.env.NOVA_OWNER_EMAIL && user.email !== process.env.NOVA_OWNER_EMAIL) return json(403, { error: 'OWNER_ACCESS_REQUIRED' });

    const orgs = await supabaseRequest('organizations?select=id,name,legal_name,timezone,currency&name=eq.NovaSpark%20Creative&limit=1');
    if (!orgs?.[0]) return json(404, { error: 'ORGANIZATION_NOT_FOUND' });
    const org = orgs[0];
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);

    const [agents,tasks,controls,integrations,goals,health,leads,companies,opportunities,projects,approvals,revenue,activities] = await Promise.all([
      supabaseRequest(`agents?organization_id=eq.${org.id}&select=id,key,name,role,status,metrics&order=name.asc`),
      supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,title,status,priority,risk,approval_required,deadline,agent_id&order=created_at.desc&limit=100`),
      supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop,outbound_enabled,spending_enabled&limit=1`),
      supabaseRequest(`integrations?organization_id=eq.${org.id}&select=provider,status&order=provider.asc`),
      supabaseRequest(`goals?organization_id=eq.${org.id}&select=id,title,objective,target_value,target_currency,forecast,status&order=created_at.desc&limit=20`),
      supabaseRequest(`system_health?organization_id=eq.${org.id}&select=component,status,latency_ms,error,checked_at&order=component.asc`),
      supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,status,score,company_id,created_at&order=created_at.desc&limit=100`),
      supabaseRequest(`companies?organization_id=eq.${org.id}&select=id,name,industry,location,fit_score,estimated_deal_value,created_at&order=created_at.desc&limit=50`),
      supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=id,name,stage,amount,currency,probability,expected_close_date,service,next_action,updated_at&order=updated_at.desc&limit=50`),
      supabaseRequest(`projects?organization_id=eq.${org.id}&select=id,name,status,description,metadata,updated_at&order=updated_at.desc&limit=30`),
      supabaseRequest(`approvals?organization_id=eq.${org.id}&select=id,task_id,risk,action,payload,status,created_at&status=eq.PENDING&order=created_at.desc&limit=30`),
      supabaseRequest(`revenue_events?organization_id=eq.${org.id}&select=id,amount,currency,event_type,channel,occurred_at,opportunity_id&occurred_at=gte.${encodeURIComponent(monthStart.toISOString())}&order=occurred_at.desc&limit=100`),
      supabaseRequest(`activities?organization_id=eq.${org.id}&select=id,type,subject,body,occurred_at&order=occurred_at.desc&limit=12`)
    ]);

    const revenueThisMonth = (revenue || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pipelineValue = (opportunities || []).filter(o => !['WON','LOST'].includes(o.stage)).reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const weightedPipeline = (opportunities || []).filter(o => !['WON','LOST'].includes(o.stage)).reduce((sum, o) => sum + Number(o.amount || 0) * Number(o.probability || 0) / 100, 0);
    const wonRevenue = (opportunities || []).filter(o => o.stage === 'WON').reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const activeTasks = (tasks || []).filter(t => ['PLANNED','PENDING','RUNNING','WAITING_APPROVAL'].includes(t.status)).length;

    return json(200, {
      ok:true, org, agents, tasks, controls:controls?.[0]||null, integrations, goals, health,
      leads, companies, opportunities, projects, approvals, revenue, activities,
      metrics: { revenueThisMonth, pipelineValue, weightedPipeline, wonRevenue, activeTasks, leadCount:(leads||[]).length, companyCount:(companies||[]).length, opportunityCount:(opportunities||[]).length }
    });
  } catch(error){ console.error(error); return json(500,{error:'STATE_LOAD_FAILED',message:error.message}); }
};
