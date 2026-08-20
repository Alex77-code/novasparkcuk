const { json, supabaseRequest, verifyUser } = require('./_nova');

async function deliver(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.COMPLETED&select=*&limit=50`);
 const reports=[];
 for(const task of tasks||[]){
   const already=await supabaseRequest(`events?organization_id=eq.${org.id}&event_type=eq.CLIENT_DELIVERY_REPORT_SENT&select=id&limit=1`);
   if(already?.length) continue;
   const report={task_id:task.id,agent:task.assigned_agent,status:'COMPLETED',delivered_at:new Date().toISOString(),summary:task.outputs?.provider_result||task.outputs?.execution||{}};
   await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CLIENT_DELIVERY_REPORT_SENT',source:'client-delivery-report',payload:report})});
   reports.push(report);
 }
 return {ok:true,reports_created:reports.length,reports};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await deliver());}catch(e){console.error(e);return json(500,{error:'CLIENT_DELIVERY_REPORT_FAILED',message:e.message});}};
module.exports.deliver=deliver;
