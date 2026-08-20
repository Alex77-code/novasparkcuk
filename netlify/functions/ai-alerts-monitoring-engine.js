const { json, supabaseRequest, verifyUser } = require('./_nova');

const ROLES=new Set(['OWNER','ADMIN','MANAGER','ANALYST','OPERATIONS']);
const TYPES=new Set(['KPI_DROP','OVERDUE_TASK','UNPAID_INVOICE','CAMPAIGN_ISSUE','SYSTEM_EVENT','CUSTOM']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'ALERTS_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const [tasks,invoices,events]=await Promise.all([
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,title,status,due_date,priority&limit=2000`),
  supabaseRequest(`invoices?organization_id=eq.${encodeURIComponent(org)}&select=id,status,total,due_date&limit=1000`),
  supabaseRequest(`events?organization_id=eq.${encodeURIComponent(org)}&select=id,event_type,created_at&order=created_at.desc&limit=100`)
 ]);
 const now=new Date();const overdue=(tasks||[]).filter(t=>t.due_date&&new Date(t.due_date)<now&&!['COMPLETED','CANCELLED'].includes(String(t.status).toUpperCase()));
 const unpaid=(invoices||[]).filter(i=>!['PAID','CANCELLED'].includes(String(i.status).toUpperCase()));
 const alerts=[];if(overdue.length)alerts.push({type:'OVERDUE_TASK',severity:overdue.length>=5?'HIGH':'MEDIUM',count:overdue.length,items:overdue.slice(0,20).map(x=>({id:x.id,title:x.title,due_date:x.due_date}))});if(unpaid.length)alerts.push({type:'UNPAID_INVOICE',severity:'MEDIUM',count:unpaid.length,items:unpaid.slice(0,20).map(x=>({id:x.id,total:x.total,due_date:x.due_date}))});
 const requested=String(body.type||'').toUpperCase();if(requested&& !TYPES.has(requested))return json(400,{error:'INVALID_ALERT_TYPE'});
 const result={checked_at:now.toISOString(),alerts:requested?alerts.filter(a=>a.type===requested):alerts,summary:{overdue_tasks:overdue.length,unpaid_invoices:unpaid.length,recent_events:(events||[]).length},mode:'DETECT_AND_REPORT',auto_execute:false};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_ALERTS_SCAN_COMPLETED',source:'ai-alerts-monitoring-engine',payload:result})});
 return json(200,{ok:true,monitoring:result,next_step:'CONNECT_NOTIFICATION_CHANNELS_AND_KPI_THRESHOLDS'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_ALERTS_ENGINE_FAILED'});}};
module.exports.run=run;
