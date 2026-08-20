const { json, supabaseRequest } = require('./_nova');

const TABLES=['system_controls','organization_members','clients','projects','tasks','events'];
async function run(event){
 const org=String((event.queryStringParameters||{}).organization_id||'').trim();
 if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const started=Date.now(),checks=[];
 for(const table of TABLES){try{const rows=await supabaseRequest(`${table}?organization_id=eq.${encodeURIComponent(org)}&select=*&limit=1`);checks.push({component:table,ok:Array.isArray(rows)});}catch(e){checks.push({component:table,ok:false,error:String(e.message||e)});}}
 const passed=checks.filter(x=>x.ok).length,failed=checks.length-passed;
 return json(failed?503:200,{ok:failed===0,status:failed?'DEGRADED':'HEALTHY',latency_ms:Date.now()-started,checks,checked_at:new Date().toISOString()});
}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'HEALTH_CHECK_FAILED'});}};
module.exports.handler=exports.handler;
