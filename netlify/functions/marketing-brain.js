const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runMarketingBrain(){
  const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
  const goals=await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_amount,currency,deadline&order=created_at.desc&limit=10`);
  const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,status,source,created_at&order=created_at.desc&limit=500`);
  const opportunities=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=id,stage,amount,probability&order=updated_at.desc&limit=500`);
  const activeGoal=goals?.[0];
  const qualified=(leads||[]).filter(x=>['QUALIFIED','MQL','SQL'].includes(String(x.status||'').toUpperCase())).length;
  const openOpp=(opportunities||[]).filter(x=>!['WON','LOST'].includes(x.stage));
  const pipeline=openOpp.reduce((s,x)=>s+Number(x.amount||0),0);
  const weighted=openOpp.reduce((s,x)=>s+Number(x.amount||0)*(Number(x.probability||0)/100),0);
  const actions=[];
  if(activeGoal){
    const target=Number(activeGoal.target_amount||0);
    if(weighted<target*.8) actions.push({agent:'PROSPECTOR',type:'PROSPECT_DISCOVERY',priority:90,reason:'Weighted pipeline below 80% of active revenue target'});
    if(qualified<10) actions.push({agent:'LEADGEN',type:'LEAD_QUALIFICATION',priority:80,reason:'Qualified lead volume is low'});
    actions.push({agent:'CMO',type:'CONTENT_CAMPAIGN',priority:60,reason:'Maintain demand generation against active revenue goal'});
    actions.push({agent:'SEO',type:'SEO_GROWTH',priority:55,reason:'Build compounding organic acquisition'});
  }
  for(const a of actions){await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'MARKETING_ACTION_RECOMMENDED',source:'marketing-brain',payload:{...a,goal_id:activeGoal?.id||null}})});}
  const snapshot={goal_id:activeGoal?.id||null,qualified_leads:qualified,open_pipeline:pipeline,weighted_pipeline:weighted,recommended_actions:actions.length,calculated_at:new Date().toISOString()};
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CMO',action:'MARKETING_ANALYSIS',resource_type:'leads',metadata:snapshot})});
  return {ok:true,snapshot,actions};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runMarketingBrain());}catch(e){console.error(e);return json(500,{error:'MARKETING_BRAIN_FAILED',message:e.message});}};
module.exports.runMarketingBrain=runMarketingBrain;
