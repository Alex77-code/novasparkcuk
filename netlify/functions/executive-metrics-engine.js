const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const [tasks,deliveries,escalations]=await Promise.all([
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,assigned_agent,qa_status&limit=2000`),
  supabaseRequest(`deliveries?organization_id=eq.${encodeURIComponent(org)}&select=id,status,retry_count&limit=2000`),
  supabaseRequest(`delivery_escalations?organization_id=eq.${encodeURIComponent(org)}&select=id,status,severity&limit=2000`)
 ]);
 const t=tasks||[],d=deliveries||[],e=escalations||[];const count=(a,k,v)=>a.filter(x=>x[k]===v).length;
 const byAgent={};for(const x of t){const a=x.assigned_agent||'UNASSIGNED';byAgent[a]=(byAgent[a]||0)+1;}
 const metrics={tasks:{total:t.length,queued:count(t,'status','QUEUED'),running:count(t,'status','RUNNING'),completed:count(t,'status','COMPLETED'),rework:count(t,'status','REWORK_REQUIRED')},qa:{pending:count(t,'qa_status','PENDING'),approved:count(t,'qa_status','QA_APPROVED'),failed:count(t,'qa_status','QA_FAILED')},agents:byAgent,deliveries:{total:d.length,ready:count(d,'status','READY'),processing:count(d,'status','PROCESSING'),sent:count(d,'status','SENT'),failed:count(d,'status','FAILED')},escalations:{open:count(e,'status','OPEN'),high:count(e,'severity','HIGH')}};
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'EXECUTIVE_METRICS_GENERATED',source:'executive-metrics-engine',payload:metrics})});
 return json(200,{ok:true,generated_at:new Date().toISOString(),metrics});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'EXECUTIVE_METRICS_FAILED'});}};
module.exports.run=run;
