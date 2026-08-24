const { json, supabaseRequest, verifyUser } = require('./_nova');

const SERVICES = {
  SEO: [
    ['SEO', 'Keyword and technical SEO baseline'],
    ['CONTENT', 'Create search-intent content brief']
  ],
  CONTENT: [
    ['CONTENT', 'Create approved content deliverable']
  ],
  SOCIAL_MEDIA: [
    ['SOCIAL_MEDIA', 'Create social content calendar']
  ],
  ADS: [
    ['ADS', 'Prepare campaign structure and tracking plan']
  ],
  WEBSITE: [
    ['WEBSITE', 'Prepare conversion and website optimisation tasks']
  ]
};

async function run(event) {
  const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
  if (!user) return json(401, { error: 'AUTHENTICATION_REQUIRED' });

  const body = JSON.parse(event.body || '{}');
  const org = String(body.organization_id || '').trim();
  const projectId = String(body.project_id || '').trim();
  const service = String(body.service_type || 'CONTENT').toUpperCase();

  if (!org || !projectId) {
    return json(400, { error: 'ORGANIZATION_AND_PROJECT_REQUIRED' });
  }

  const stop = (await supabaseRequest(
    `system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`
  ))?.[0];

  if (stop?.emergency_stop) {
    return json(200, { skipped: true, reason: 'EMERGENCY_STOP' });
  }

  const templates = SERVICES[service] || [['CONTENT', 'Create approved content deliverable']];
  const created = [];

  for (const item of templates) {
    const type = item[0];
    const title = item[1];
    const rows = await supabaseRequest('tasks', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: org,
        project_id: projectId,
        title,
        status: 'PENDING',
        task_type: type,
        priority: 'NORMAL',
        metadata: {
          service_type: service,
          execution_mode: 'AUTONOMOUS',
          created_by: user.id || null
        }
      })
    });
    if (rows?.[0]) created.push(rows[0]);
  }

  await supabaseRequest('events', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: org,
      event_type: 'MARKETING_EXECUTION_PLAN_CREATED',
      source: 'marketing-execution-planner',
      payload: {
        project_id: projectId,
        service_type: service,
        task_count: created.length
      }
    })
  });

  return json(200, {
    ok: true,
    project_id: projectId,
    service_type: service,
    created_tasks: created.length
  });
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    return await run(event);
  } catch (e) {
    console.error(e);
    return json(500, { error: 'MARKETING_PLANNER_FAILED', message: e.message });
  }
};

module.exports.run = run;
