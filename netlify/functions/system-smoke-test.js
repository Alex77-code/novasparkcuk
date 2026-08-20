const { json, supabaseRequest, verifyUser } = require('./_nova');
const CHECKS=['system_controls','organization_members','clients','projects','tasks','invoices','payments','events','notification_queue','knowledge_memory','knowledge_documents','knowledge_chunks','agent_tool_requests','ai_execution_runs'];
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const results=[];for(const table of CHECKS){try{const rows=await supabaseRequest(`${table}?organization_id=eq.${encodeURIComponent(org)}&select=*&limit=1`);results.push({table,ok:Array.isArray(rows)});}catch(e){results.push({table,ok:false,error:String(e.message||e)});}}
 const passed=results.filter(x=>x.ok).length;const failed=results.length-passed;await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SYSTEM_SMOKE_TEST_COMPLETED',source:'system-smoke-test',payload:{passed,failed,total:results.length}})});
 return json(200,{ok:failed===0,summary:{passed,failed,total:results.length},checks:results});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SMOKE_TEST_FAILED'});}};
module.exports.run=run;
