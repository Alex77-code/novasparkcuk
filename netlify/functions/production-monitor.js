const { json, supabaseRequest } = require('./_nova');

const COMPONENTS=['system_controls','organization_members','clients','projects','tasks','events','knowledge_documents','knowledge_chunks','agent_tool_requests','ai_execution_runs','notification_queue'];
async function check(org){
 const checks=[];for(const table of COMPONENTS){try{const rows=await supabaseRequest(`${table}?organization_id=eq.${encodeURIComponent(org)}&select=*&limit=1`);checks.push({component:table,ok:Array.isArray(rows)});}catch(e){checks.push({component:table,ok:false,error:String(e.message||e)});}}
 const failed=checks.filter(x=>!x.ok).length;return {status:failed?'DEGRADED':'HEALTHY',passed:checks.length-failed,failed,total:checks.length,checks};
}
async function run(event){const org=String((event.queryStringParameters||{}).organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});const started=Date.now();const health=await check(org);return json(health.status==='HEALTHY'?200:503,{ok:health.status==='HEALTHY',status:health.status,latency_ms:Date.now()-started,health,checked_at:new Date().toISOString()});}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'PRODUCTION_MONITOR_FAILED'})}};
module.exports.check=check;
