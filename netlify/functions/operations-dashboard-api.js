const { json, supabaseRequest, verifyUser } = require('./_nova');

async function count(path){const rows=await supabaseRequest(path);return Array.isArray(rows)?rows.length:0;}
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];
 const base=`organization_id=eq.${encodeURIComponent(org)}`;
 const [pending,inProgress,qaFailed,approvals,readyDeliveries,failedDeliveries]=await Promise.all([
  count(`tasks?${base}&status=in.(PENDING,QUEUED)&select=id&limit=1000`),
  count(`tasks?${base}&status=eq.IN_PROGRESS&select=id&limit=1000`),
  count(`tasks?${base}&status=eq.QA_FAILED&select=id&limit=1000`),
  count(`task_approvals?${base}&status=eq.PENDING&select=id&limit=1000`),
  count(`deliveries?${base}&status=in.(READY,PROCESSING)&select=id&limit=1000`),
  count(`deliveries?${base}&status=eq.FAILED&select=id&limit=1000`)
 ]);
 return json(200,{ok:true,organization_id:org,system:{emergency_stop:Boolean(stop?.emergency_stop)},workload:{pending,in_progress:inProgress,qa_failed:qaFailed},approvals:{pending:approvals},delivery:{active:readyDeliveries,failed:failedDeliveries},generated_at:new Date().toISOString()});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'OPERATIONS_DASHBOARD_FAILED'});}};
module.exports.run=run;
