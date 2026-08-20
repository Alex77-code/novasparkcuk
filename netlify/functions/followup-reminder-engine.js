const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();
 if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const now=new Date().toISOString();
 const entries=await supabaseRequest(`client_communications?organization_id=eq.${encodeURIComponent(org)}&type=eq.FOLLOW_UP&select=id,project_id,content,created_at&order=created_at.asc&limit=100`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=in.(PENDING,IN_PROGRESS)&task_type=eq.CLIENT_DELIVERY&select=id,project_id,title,status,priority&limit=200`);
 const reminders=[];for(const e of entries||[]){reminders.push({source:'FOLLOW_UP',communication_id:e.id,project_id:e.project_id,action:'REVIEW_FOLLOW_UP',due_status:'PENDING_REVIEW'});}for(const t of tasks||[]){reminders.push({source:'DELIVERY_TASK',task_id:t.id,project_id:t.project_id,action:'REVIEW_TASK_PROGRESS',due_status:t.status,priority:t.priority||'NORMAL'});}
 if(reminders.length)await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'FOLLOWUP_REMINDERS_GENERATED',source:'followup-reminder-engine',payload:{count:reminders.length,generated_at:now,reminders}})});
 return json(200,{ok:true,generated:reminders.length,reminders,delivery:'REMINDERS_ONLY'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'FOLLOWUP_REMINDER_ENGINE_FAILED'});}};
module.exports.run=run;
