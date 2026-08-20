const { json, supabaseRequest, verifyUser } = require('./_nova');

const RULES={
 SEO:['keyword_strategy','technical_checks','measurement_plan'],
 CONTENT:['brief','audience','cta'],
 SOCIAL_MEDIA:['platforms','content_calendar','approval'],
 ADS:['targeting','budget','tracking'],
 WEBSITE:['requirements','conversion_goal','qa'],
 REPORTING:['kpis','period','recommendations']
};
function evaluate(task){
 const type=String(task.metadata?.service_type||task.task_type||'CONTENT').toUpperCase();
 const required=RULES[type]||['objective','deliverable','qa'];
 const output=task.outputs?.execution||task.result||{};
 const text=JSON.stringify(output).toLowerCase();
 const missing=required.filter(x=>!text.includes(x.replace(/_/g,' '))&&!text.includes(x));
 const score=Math.max(0,100-Math.round((missing.length/required.length)*100));
 return {service:type,score,passed:missing.length===0,missing,required};
}
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim();if(!org)return json(400,{error:'ORGANIZATION_ID_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.WAITING_QA&select=id,title,status,outputs,result,metadata,task_type&limit=50`);const results=[];
 for(const task of tasks||[]){const qa=evaluate(task);const now=new Date().toISOString();const next=qa.passed?'COMPLETED':'FAILED';await supabaseRequest(`tasks?id=eq.${encodeURIComponent(task.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:next,metadata:{...(task.metadata||{}),service_qa:{...qa,checked_at:now}},updated_at:now})});results.push({task_id:task.id,status:next,qa});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'SERVICE_QA_COMPLETED',source:'service-qa-engine',payload:{count:results.length,results}})});return json(200,{ok:true,checked:results.length,results});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'SERVICE_QA_FAILED',message:e.message});}};
module.exports.run=run;
