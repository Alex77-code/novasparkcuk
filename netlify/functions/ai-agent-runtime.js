const { json, supabaseRequest, verifyUser } = require('./_nova');

const MODEL = process.env.NOVA_AI_MODEL || 'gpt-5.6-luna';
const ALLOWED_AGENTS = new Set(['PROSPECTOR','LEADGEN','CONTENT','SEO','SALES','ANALYTICS','CMO','DELIVERY']);

const SYSTEM = `You are a specialist worker inside NovaSpark Creative Ltd. Execute only the supplied task. Use verified inputs; do not invent customer data, testimonials, results, rankings, budgets, credentials or completed work. Return concise structured work with: objective, actions, deliverable, assumptions, risks, acceptance_checks. Do not send messages, spend money, publish ads/content, or make irreversible external changes. Those actions require separate approved integrations.`;

async function runAiAgentRuntime(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&status=eq.AI_READY&select=*&order=priority.desc,created_at.asc&limit=5`);
 const results=[];
 for(const task of tasks||[]){
   const agent=String(task.inputs?.agent||'').toUpperCase();
   if(!ALLOWED_AGENTS.has(agent)) continue;
   try{
     const input=`Agent: ${agent}\nTask: ${task.title}\nDescription: ${task.description}\nVerified inputs: ${JSON.stringify(task.inputs||{})}`;
     const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:MODEL,instructions:SYSTEM,input,temperature:0.2})});
     const body=await r.json();
     if(!r.ok) throw new Error(`AI provider ${r.status}`);
     const output=body.output_text||'';
     if(!output) throw new Error('AI returned empty output');
     const now=new Date().toISOString();
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'WAITING_APPROVAL',outputs:{model:MODEL,agent,content:output},updated_at:now})});
     await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'AI_AGENT_OUTPUT_READY',source:'ai-agent-runtime',payload:{task_id:task.id,agent,approval_required:true}})});
     results.push({task_id:task.id,status:'WAITING_APPROVAL'});
   }catch(error){
     await supabaseRequest(`tasks?id=eq.${task.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FAILED',error_message:error.message,updated_at:new Date().toISOString()})});
     results.push({task_id:task.id,status:'FAILED',error:error.message});
   }
 }
 return {ok:true,processed:results.length,results};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runAiAgentRuntime());}catch(e){console.error(e);return json(500,{error:'AI_AGENT_RUNTIME_FAILED',message:e.message});}};
module.exports.runAiAgentRuntime=runAiAgentRuntime;
