const { json, supabaseRequest, verifyUser } = require('./_nova');

const ACTIONS={
  PROSPECT_DISCOVERY:{agent:'PROSPECTOR',title:'Discover qualified UK prospects',approval:false},
  LEAD_QUALIFICATION:{agent:'LEADGEN',title:'Qualify marketing leads',approval:false},
  CONTENT_CAMPAIGN:{agent:'CONTENT',title:'Create revenue-aligned content campaign',approval:false},
  SEO_GROWTH:{agent:'SEO',title:'Create measurable SEO growth plan',approval:false},
  OUTBOUND_CAMPAIGN:{agent:'SALES',title:'Prepare outbound campaign',approval:true},
  PAID_ADS:{agent:'CMO',title:'Prepare paid advertising campaign',approval:true}
};

async function executeMarketingActions(){
 const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const events=await supabaseRequest(`events?organization_id=eq.${org.id}&event_type=eq.MARKETING_ACTION_RECOMMENDED&select=id,payload,created_at&order=created_at.asc&limit=25`);
 const results=[];
 for(const event of events||[]){
   const a=ACTIONS[String(event.payload?.type||'').toUpperCase()]; if(!a) continue;
   const requiresApproval=a.approval || ['OUTBOUND_CAMPAIGN','PAID_ADS'].includes(String(event.payload?.type||'').toUpperCase());
   await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({organization_id:org.id,title:a.title,description:event.payload?.reason||'',status:requiresApproval?'WAITING_APPROVAL':'QUEUED',priority:Number(event.payload?.priority||50),approval_required:requiresApproval,inputs:{agent:a.agent,source_event:event.id,goal_id:event.payload?.goal_id||null}})});
   results.push({event_id:event.id,agent:a.agent,status:requiresApproval?'WAITING_APPROVAL':'QUEUED'});
   await supabaseRequest(`events?id=eq.${event.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({payload:{...event.payload,execution_status:requiresApproval?'WAITING_APPROVAL':'QUEUED'}})});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CMO',action:'MARKETING_EXECUTION',resource_type:'tasks',metadata:{processed:results.length,results}})});
 return {ok:true,processed:results.length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await executeMarketingActions());}catch(e){console.error(e);return json(500,{error:'MARKETING_EXECUTION_FAILED',message:e.message});}};
module.exports.executeMarketingActions=executeMarketingActions;
