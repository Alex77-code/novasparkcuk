const { json, supabaseRequest, verifyUser } = require('./_nova');

const PLAN_STEPS = [
  { type:'PROSPECT_DISCOVERY', agent:'PROSPECTOR', priority:90 },
  { type:'LEAD_QUALIFICATION', agent:'LEADGEN', priority:85 },
  { type:'CONTENT_CAMPAIGN', agent:'CONTENT', priority:60 },
  { type:'SEO_GROWTH', agent:'SEO', priority:55 },
  { type:'SALES_PIPELINE', agent:'SALES', priority:80 },
  { type:'ANALYTICS', agent:'ANALYTICS', priority:50 }
];

async function orchestrate(goalId){
  const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
  const goal=(await supabaseRequest(`ceo_goals?id=eq.${goalId}&organization_id=eq.${org.id}&select=*&limit=1`))?.[0];
  if(!goal) throw new Error('CEO goal not found');

  const existing=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=title,status,inputs&limit=1000`);
  const created=[];
  for(const step of PLAN_STEPS){
    const title=`CEO Goal ${goal.id}: ${step.type}`;
    const exists=(existing||[]).some(t=>t.title===title && t.inputs?.goal_id===goal.id && !['FAILED','CANCELLED'].includes(t.status));
    if(exists) continue;
    const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title,description:`Execute ${step.type} in support of CEO revenue goal ${goal.title}. Use verified business data and report measurable results.`,status:'QUEUED',priority:step.priority,approval_required:['SALES_PIPELINE'].includes(step.type),inputs:{goal_id:goal.id,agent:step.agent,action_type:step.type,target_amount:goal.target_amount,currency:goal.currency,deadline:goal.deadline}})}))?.[0];
    if(task) created.push(task.id);
  }
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CEO_PLAN_ACTIVATED',source:'ceo-orchestrator',payload:{goal_id:goal.id,tasks_created:created.length,task_ids:created}})});
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CEO',action:'ORCHESTRATE_GOAL',resource_type:'ceo_goals',resource_id:goal.id,metadata:{tasks_created:created.length}})});
  return {ok:true,goal_id:goal.id,tasks_created:created.length,task_ids:created};
}

exports.handler=async event=>{
 if(event.httpMethod!=='POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
 try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const body=JSON.parse(event.body||'{}');if(!body.goal_id)return json(400,{error:'GOAL_ID_REQUIRED'});return json(200,await orchestrate(body.goal_id));}
 catch(e){console.error(e);return json(500,{error:'CEO_ORCHESTRATOR_FAILED',message:e.message});}
};
module.exports.orchestrate=orchestrate;
