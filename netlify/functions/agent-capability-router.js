const { json, supabaseRequest, verifyUser } = require('./_nova');

const CAPABILITIES={
 PROSPECTOR:{mode:'RESEARCH',description:'Build a prospect research task from approved target criteria.'},
 LEADGEN:{mode:'RESEARCH',description:'Build lead qualification and enrichment tasks.'},
 CONTENT:{mode:'CREATE',description:'Create marketing content from an approved brief.'},
 SEO:{mode:'RESEARCH_CREATE',description:'Create SEO research, recommendations and reviewable work.'},
 SALES:{mode:'COMMERCIAL',description:'Prepare sales actions; external contact remains approval-gated.'},
 ANALYTICS:{mode:'ANALYZE',description:'Analyze verified business metrics and produce KPI findings.'},
 CMO:{mode:'CAMPAIGN',description:'Prepare campaign assets; spend/publishing remains approval-gated.'},
 DELIVERY:{mode:'DELIVER',description:'Prepare client delivery artifacts from approved project requirements.'}
};

async function routeCapabilities(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.QUEUED&select=*&order=priority.desc,created_at.asc&limit=50`);
 const routed=[];
 for(const task of tasks||[]){
   const agent=String(task.inputs?.agent||'').toUpperCase();
   const capability=CAPABILITIES[agent]; if(!capability) continue;
   const requiresApproval=Boolean(task.approval_required)||['SALES','CMO'].includes(agent);
   await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({inputs:{...(task.inputs||{}),capability_mode:capability.mode,capability_description:capability.description,external_action_requires_approval:requiresApproval},updated_at:new Date().toISOString()})});
   routed.push({task_id:task.id,agent,mode:capability.mode,approval_required:requiresApproval});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CTO',action:'ROUTE_AGENT_CAPABILITIES',resource_type:'tasks',metadata:{routed:routed.length}})});
 return {ok:true,routed};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await routeCapabilities());}catch(e){console.error(e);return json(500,{error:'AGENT_CAPABILITY_ROUTER_FAILED',message:e.message});}};
module.exports.routeCapabilities=routeCapabilities;
