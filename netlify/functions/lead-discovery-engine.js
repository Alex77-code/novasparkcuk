const { json, supabaseRequest, verifyUser } = require('./_nova');

const TARGET_SERVICE_SET = new Set(['SEO','CONTENT','SOCIAL','PAID_ADS','WEBSITE','ANALYTICS']);

async function discoverLeads(){
  const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
  const goals=await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_amount,deadline&limit=10`);
  const existing=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=company_name,website,email,status,source&limit=2000`);
  const queued=[];
  for(const goal of goals||[]){
    const task=(await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Verified lead discovery: ${goal.title}`,description:'Discover real prospective UK businesses using an approved data source. Record company name, website, business category, location, source URL/evidence and qualification signals. Never invent contact details. Deduplicate against existing leads.',status:'AI_READY',priority:95,approval_required:false,inputs:{agent:'PROSPECTOR',goal_id:goal.id,services:[...TARGET_SERVICE_SET],research_region:'UK',require_source_evidence:true,existing_lead_count:(existing||[]).length}})}))?.[0];
    if(task) queued.push(task.id);
  }
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CRO',action:'VERIFIED_LEAD_DISCOVERY_QUEUED',resource_type:'tasks',metadata:{active_goals:(goals||[]).length,tasks_created:queued.length}})});
  return {ok:true,tasks_created:queued.length,task_ids:queued};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await discoverLeads());}catch(e){console.error(e);return json(500,{error:'LEAD_DISCOVERY_FAILED',message:e.message});}};
module.exports.discoverLeads=discoverLeads;
