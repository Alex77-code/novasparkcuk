const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const [tasks,deliveries,escalations]=await Promise.all([
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,qa_status&limit=2000`),
  supabaseRequest(`deliveries?organization_id=eq.${encodeURIComponent(org)}&select=id,status,retry_count&limit=2000`),
  supabaseRequest(`delivery_escalations?organization_id=eq.${encodeURIComponent(org)}&status=eq.OPEN&select=id,severity&limit=1000`)
 ]);
 const t=tasks||[],d=deliveries||[],e=escalations||[];const count=(a,k,v)=>a.filter(x=>x[k]===v).length;const recommendations=[];
 if(count(t,'status','REWORK_REQUIRED')>5)recommendations.push({action:'REVIEW_REWORK_QUEUE',priority:'HIGH',reason:'High rework backlog'});
 if(count(d,'status','FAILED')>0)recommendations.push({action:'RUN_DELIVERY_RECOVERY',priority:'HIGH',reason:'Failed deliveries detected'});
 if(e.length>0)recommendations.push({action:'ESCALATE_OPEN_FAILURES',priority:'CRITICAL',reason:'Open delivery escalations exist'});
 if(count(t,'status','QUEUED')>25)recommendations.push({action:'SCALE_AGENT_CAPACITY',priority:'MEDIUM',reason:'Large queued task backlog'});
 if(!recommendations.length)recommendations.push({action:'CONTINUE_NORMAL_OPERATIONS',priority:'LOW',reason:'No threshold breach detected'});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'COO_DECISIONS_GENERATED',source:'ai-coo-decision-engine',payload:{recommendations,generated_at:new Date().toISOString()}})});
 return json(200,{ok:true,recommendations,execution_mode:'RECOMMEND_ONLY',human_approval_required:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_COO_DECISION_FAILED'});}};
module.exports.run=run;
