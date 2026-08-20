const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();
 if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const projects=await supabaseRequest(`projects?organization_id=eq.${encodeURIComponent(org)}&status=eq.ACTIVE&select=id,name,approval_status&limit=200`);
 const planned=[];
 for(const project of projects||[]){
  planned.push({project_id:project.id,project_name:project.name||null,period:'MONTHLY',status:'REPORT_READY',requires_approval:true});
 }
 if(planned.length)await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'MONTHLY_REPORTS_PLANNED',source:'monthly-reporting-scheduler',payload:{count:planned.length,projects:planned,requested_by:user.id||null}})});
 return json(200,{ok:true,period:'MONTHLY',reports_planned:planned.length,reports:planned,delivery:'NOT_SENT'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'MONTHLY_REPORTING_FAILED',message:e.message});}};
module.exports.run=run;
