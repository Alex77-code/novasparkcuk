const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runCeoDecisionEngine(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const goals=await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=*&limit=20`);
 const opportunities=await supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&select=*&limit=2000`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,priority,inputs&limit=2000`);
 const plans=[];
 for(const goal of goals||[]){
   const target=Number(goal.target_amount)||0;
   const paid=(await supabaseRequest(`payments?organization_id=eq.${org.id}&status=eq.PAID&goal_id=eq.${goal.id}&select=amount`))||[];
   const revenue=paid.reduce((s,p)=>s+(Number(p.amount)||0),0);
   const open=(opportunities||[]).filter(o=>!['LOST','CLOSED'].includes(o.status));
   const weighted=open.reduce((s,o)=>s+(Number(o.expected_value||o.value)||0)*(Math.max(0,Math.min(100,Number(o.probability)||0))/100),0);
   const remaining=Math.max(target-revenue,0);
   const hasAcquisition=tasks.some(t=>['AI_READY','QUEUED'].includes(t.status)&&['PROSPECTOR','LEADGEN'].includes(String(t.inputs?.agent||'').toUpperCase()));
   const hasSales=tasks.some(t=>['AI_READY','QUEUED'].includes(t.status)&&String(t.inputs?.agent||'').toUpperCase()==='SALES');
   const actions=[];
   if(remaining===0) actions.push({type:'MAINTAIN',reason:'Revenue target reached'});
   else if(weighted<remaining){
     if(!hasAcquisition) actions.push({type:'CREATE_PROSPECTING',priority:100});
     if(!hasSales) actions.push({type:'CREATE_SALES_PIPELINE',priority:95});
   } else actions.push({type:'CONVERT_PIPELINE',priority:90});
   const plan={goal_id:goal.id,target,revenue,remaining,weighted_pipeline:weighted,actions};
   plans.push(plan);
   for(const action of actions){
     if(action.type==='CREATE_PROSPECTING') await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({organization_id:org.id,title:`CEO acquisition sprint for ${goal.title}`,description:'Increase verified prospect discovery toward the active revenue goal. Use approved data sources and evidence; do not invent contact information.',status:'QUEUED',priority:action.priority,approval_required:false,inputs:{agent:'PROSPECTOR',action_type:'CEO_REVENUE_SPRINT',goal_id:goal.id}})});
     if(action.type==='CREATE_SALES_PIPELINE') await supabaseRequest('tasks',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({organization_id:org.id,title:`CEO sales sprint for ${goal.title}`,description:'Advance qualified opportunities toward the active revenue goal. Prepare reviewable sales assets; external communication remains approval-gated.',status:'QUEUED',priority:action.priority,approval_required:true,inputs:{agent:'SALES',action_type:'CEO_REVENUE_SPRINT',goal_id:goal.id}})});
   }
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CEO',action:'CEO_DECISION_CYCLE',resource_type:'ceo_goals',metadata:{plans:plans.length}})});
 return {ok:true,plans};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runCeoDecisionEngine());}catch(e){console.error(e);return json(500,{error:'CEO_DECISION_ENGINE_FAILED',message:e.message});}};
module.exports.runCeoDecisionEngine=runCeoDecisionEngine;
