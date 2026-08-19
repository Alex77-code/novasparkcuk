const { json, supabaseRequest, verifyUser } = require('./_nova');

function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}

async function runFinancialIntelligence(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const goals=await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=*&limit=20`);
 const opportunities=await supabaseRequest(`sales_opportunities?organization_id=eq.${org.id}&select=*&limit=2000`);
 const payments=await supabaseRequest(`payments?organization_id=eq.${org.id}&status=eq.PAID&select=*&limit=2000`);
 const projects=await supabaseRequest(`client_projects?organization_id=eq.${org.id}&select=*&limit=2000`);
 const snapshots=[];
 for(const goal of goals||[]){
   const target=num(goal.target_amount);
   const paid=(payments||[]).filter(p=>goal.id===p.goal_id).reduce((s,p)=>s+num(p.amount),0);
   const pipeline=(opportunities||[]).filter(o=>!['LOST','CLOSED'].includes(o.status)).reduce((s,o)=>s+num(o.expected_value||o.value),0);
   const remaining=Math.max(target-paid,0);
   const weighted= (opportunities||[]).filter(o=>!['LOST','CLOSED'].includes(o.status)).reduce((s,o)=>s+num(o.expected_value||o.value)*Math.max(0,Math.min(100,num(o.probability)))/100,0);
   const coverage=remaining>0?weighted/remaining:1;
   const action=remaining===0?'TARGET_REACHED':coverage>=1?'PIPELINE_COVERED':'ACQUISITION_REQUIRED';
   const snapshot={goal_id:goal.id,target,paid,remaining,pipeline,weighted_pipeline:weighted,pipeline_coverage:coverage,active_projects:(projects||[]).filter(p=>p.status==='ACTIVE_DELIVERY').length,action};
   snapshots.push(snapshot);
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CEO_FINANCIAL_SNAPSHOT',source:'ceo-financial-intelligence',payload:snapshot})});
 }
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CFO',action:'FINANCIAL_INTELLIGENCE_RUN',resource_type:'ceo_goals',metadata:{goals:(goals||[]).length,snapshots:snapshots.length}})});
 return {ok:true,snapshots};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runFinancialIntelligence());}catch(e){console.error(e);return json(500,{error:'CEO_FINANCIAL_INTELLIGENCE_FAILED',message:e.message});}};
module.exports.runFinancialIntelligence=runFinancialIntelligence;
