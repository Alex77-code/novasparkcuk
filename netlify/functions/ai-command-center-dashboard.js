const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','ANALYST','OPERATIONS']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'DASHBOARD_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];
 const [clients,projects,tasks,invoices,payments,alerts,notifications]=await Promise.all([
  supabaseRequest(`clients?organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=1000`),
  supabaseRequest(`projects?organization_id=eq.${encodeURIComponent(org)}&select=id,status&limit=1000`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,due_date&limit=2000`),
  supabaseRequest(`invoices?organization_id=eq.${encodeURIComponent(org)}&select=id,status,total&limit=1000`),
  supabaseRequest(`payments?organization_id=eq.${encodeURIComponent(org)}&select=id,status,amount&limit=1000`),
  supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&select=id,event_type,created_at&order=created_at.desc&limit=100&event_type=eq.AI_ALERTS_SCAN_COMPLETED`),
  supabaseRequest(`notification_queue?organization_id=eq.${encodeURIComponent(org)}&select=id,status,channel,type,created_at&order=created_at.desc&limit=20`)
 ]);
 const sum=(rows,key)=> (rows||[]).reduce((n,r)=>n+(Number(r[key])||0),0);const taskRows=tasks||[];const overdue=taskRows.filter(t=>t.due_date&&new Date(t.due_date)<new Date()&&!['COMPLETED','CANCELLED'].includes(String(t.status).toUpperCase())).length;
 const data={emergency_stop:Boolean(stop?.emergency_stop),clients:{total:(clients||[]).length,active:(clients||[]).filter(x=>String(x.status).toUpperCase()==='ACTIVE').length},projects:{total:(projects||[]).length,in_progress:(projects||[]).filter(x=>String(x.status).toUpperCase()==='IN_PROGRESS').length},tasks:{total:taskRows.length,completed:taskRows.filter(x=>String(x.status).toUpperCase()==='COMPLETED').length,overdue},finance:{invoiced_total:sum(invoices,'total'),payments_received:sum(payments,'amount')},alerts:{recent_scans:(alerts||[]).length},notifications:{queued:(notifications||[]).filter(x=>String(x.status).toUpperCase()==='QUEUED').length,recent:notifications||[]}};
 return json(200,{ok:true,dashboard:{title:'NovaSpark AI Command Center',role,kpis:data,modules:['AI CEO','Clients','Marketing','Delivery','Finance','Analytics','AI Workforce','Knowledge','Governance','Notifications'],execution_locked:Boolean(stop?.emergency_stop),generated_at:new Date().toISOString()}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'COMMAND_CENTER_FAILED'});}};
module.exports.run=run;
