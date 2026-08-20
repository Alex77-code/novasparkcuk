const { json, supabaseRequest, verifyUser } = require('./_nova');

const outputs={
 'account-manager':t=>({type:'onboarding_brief',task:t.title,next_action:'Collect client brief and primary contacts'}),
 operations:t=>({type:'operations_plan',task:t.title,next_action:'Prepare approved access and operating checklist'}),
 strategy:t=>({type:'strategy_baseline',task:t.title,next_action:'Define baseline KPIs, goals and measurement plan'}),
 marketing:t=>({type:'campaign_plan',task:t.title,next_action:'Prepare a 30-day marketing execution plan for review'}),
 qa:t=>({type:'qa_plan',task:t.title,next_action:'Define acceptance criteria and reporting checks'})
};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization); if(!user)return {statusCode:401,body:{error:'AUTHENTICATION_REQUIRED'}};
 const body=JSON.parse(event.body||'{}'); const org=String(body.organization_id||'').trim(); if(!org)return {statusCode:400,body:{error:'ORGANIZATION_ID_REQUIRED'}};
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0]; if(stop?.emergency_stop)return {statusCode:200,body:{skipped:true,reason:'EMERGENCY_STOP'}};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&status=eq.QUEUED&select=id,title,description,metadata,task_type,retries,max_retries&limit=20`); const results=[];
 for(const t of tasks||[]){const agent=t.metadata?.agent||'operations';const result=(outputs[agent]||outputs.operations)(t);const now=new Date().toISOString();await supabaseRequest(`tasks?id=eq.${encodeURIComponent(t.id)}&organization_id=eq.${encodeURIComponent(org)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'WAITING_QA',outputs:{execution:result,agent,executed_at:now},result,updated_at:now})});results.push({task_id:t.id,agent,status:'WAITING_QA'});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_AGENT_TASKS_EXECUTED',source:'ai-agent-worker',payload:{count:results.length,results}})});return {statusCode:200,body:{ok:true,executed:results.length,results}};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const r=await run(event);return json(r.statusCode,r.body);}catch(e){console.error(e);return json(500,{error:'AI_AGENT_WORKER_FAILED',message:e.message});}};
module.exports.run=run;
