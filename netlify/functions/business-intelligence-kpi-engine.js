const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','ANALYST','OPERATIONS']);
const ACTIONS=new Set(['DASHBOARD','KPI_PLAN','PERFORMANCE_SUMMARY','ALERTS']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'DASHBOARD').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'BI_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const [clients,projects,tasks,invoices,payments,events]=await Promise.all([
  supabaseRequest(`clients?organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=1000`),
  supabaseRequest(`projects?organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=1000`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,priority&limit=2000`),
  supabaseRequest(`invoices?organization_id=eq.${encodeURIComponent(org)}&select=id,status,total&limit=1000`),
  supabaseRequest(`payments?organization_id=eq.${encodeURIComponent(org)}&select=id,status,amount&limit=1000`),
  supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&select=id,event_type,created_at&order=created_at.desc&limit=100`)
 ]);
 const c=clients||[],p=projects||[],t=tasks||[],i=invoices||[],pay=payments||[];const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number(r[key])||0),0);
 const kpis={clients_total:c.length,clients_active:c.filter(x=>String(x.status).toUpperCase()==='ACTIVE').length,projects_total:p.length,projects_in_progress:p.filter(x=>String(x.status).toUpperCase()==='IN_PROGRESS').length,tasks_total:t.length,tasks_completed:t.filter(x=>String(x.status).toUpperCase()==='COMPLETED').length,tasks_pending:t.filter(x=>String(x.status).toUpperCase()==='PENDING').length,invoiced_total:sum(i,'total'),payments_received:sum(pay,'amount'),events_last_100:(events||[]).length};
 const recommendations=['Track revenue, pipeline and client retention together','Monitor delivery completion and overdue work','Compare marketing activity with qualified leads and conversions','Set threshold-based alerts for material KPI changes'];
 const payload={action,kpis,recommendations,execution_mode:'READ_AND_ANALYZE',data_sources:['clients','projects','tasks','invoices','payments','events'],generated_at:new Date().toISOString()};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'BI_KPI_ANALYSIS_GENERATED',source:'business-intelligence-kpi-engine',payload:{action,kpis}})});
 return json(200,{ok:true,bi:payload,next_step:'CONNECT_ANALYTICS_AND_ALERTING_LAYER'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'BI_KPI_ENGINE_FAILED'});}};
module.exports.run=run;
