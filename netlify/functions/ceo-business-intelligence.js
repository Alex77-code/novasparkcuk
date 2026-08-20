const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const [projects,tasks,events]=await Promise.all([
  supabaseRequest(`projects?organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=500`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,task_type,priority&limit=1000`),
  supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&select=id,event_type,created_at&order=created_at.desc&limit=500`)
 ]);
 const p=projects||[],t=tasks||[],e=events||[];const completed=t.filter(x=>x.status==='COMPLETED').length,failed=t.filter(x=>x.status==='FAILED').length;
 const kpis={projects:p.length,active_projects:p.filter(x=>x.status==='ACTIVE').length,total_tasks:t.length,completed_tasks:completed,failed_tasks:failed,pending_tasks:t.filter(x=>!['COMPLETED','FAILED'].includes(x.status)).length,completion_rate:t.length?Math.round(completed/t.length*100):0,events_last_500:e.length};
 const risks=[];if(failed>10)risks.push('High failed-task backlog');if(kpis.completion_rate<70&&t.length>=10)risks.push('Execution completion rate below 70%');
 const dashboard={generated_at:new Date().toISOString(),kpis,risks,recommended_actions:risks.length?['Review failure backlog','Prioritize blocked client deliverables']:['Continue autonomous execution','Review weekly KPI trend'],security:{credentials_exposed:false,external_publish_requires_approval:true}};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CEO_BI_DASHBOARD_GENERATED',source:'ceo-business-intelligence',payload:dashboard})});
 return json(200,{ok:true,dashboard});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CEO_BI_FAILED',message:e.message});}};
module.exports.run=run;
