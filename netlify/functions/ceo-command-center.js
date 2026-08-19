const { json, supabaseRequest, verifyUser } = require('./_nova');

async function commandCenter(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const [goals,leads,opps,projects,tasks,revenue,events]=await Promise.all([
  supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&select=*&order=created_at.desc&limit=20`),
  supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,status,source&limit=500`),
  supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=id,stage,amount,probability,currency&limit=500`),
  supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&select=id,status,qa_status,owner_review_status&limit=500`),
  supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,priority,approval_required&limit=1000`),
  supabaseRequest(`revenue_events?organization_id=eq.${org.id}&select=amount,event_type,currency,occurred_at&order=occurred_at.desc&limit=500`),
  supabaseRequest(`events?organization_id=eq.${org.id}&select=event_type,payload,created_at&order=created_at.desc&limit=100`)
 ]);
 const openOpp=(opps||[]).filter(o=>!['WON','LOST'].includes(o.stage));
 const dashboard={organization:org,goals:goals||[],kpis:{leads:(leads||[]).length,qualified_leads:(leads||[]).filter(l=>['QUALIFIED','MQL','SQL'].includes(String(l.status).toUpperCase())).length,open_pipeline:openOpp.reduce((s,o)=>s+Number(o.amount||0),0),weighted_pipeline:openOpp.reduce((s,o)=>s+Number(o.amount||0)*Number(o.probability||0)/100,0),won_value:(opps||[]).filter(o=>o.stage==='WON').reduce((s,o)=>s+Number(o.amount||0),0),active_projects:(projects||[]).filter(p=>!['COMPLETED','CANCELLED'].includes(p.status)).length,qa_failed:(projects||[]).filter(p=>p.qa_status==='FAILED').length,pending_approvals:(tasks||[]).filter(t=>t.approval_required&&t.status==='WAITING_APPROVAL').length,revenue:(revenue||[]).filter(r=>['SALE','PAYMENT','REVENUE'].includes(String(r.event_type).toUpperCase())).reduce((s,r)=>s+Number(r.amount||0),0)},recent_events:(events||[]).slice(0,20)};
 return {ok:true,dashboard};
}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await commandCenter());}catch(e){console.error(e);return json(500,{error:'CEO_COMMAND_CENTER_FAILED',message:e.message});}};
module.exports.commandCenter=commandCenter;
