const { json, supabaseRequest } = require('./_nova');

async function callProvider(input){
 const url=process.env.NOVA_AI_WORKER_URL;
 const secret=process.env.NOVA_AI_WORKER_SECRET;
 if(!url||!secret) throw new Error('AI_PROVIDER_NOT_CONFIGURED');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${secret}`},body:JSON.stringify({task_id:input.task_id,agent:input.agent,instructions:input.instructions,context:input.context||{}})});
 if(!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
 return response.json();
}

exports.handler=async event=>{
 if(event.httpMethod!=='POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
 try{
   const body=JSON.parse(event.body||'{}');
   const result=await callProvider(body);
   if(body.task_id){
     await supabaseRequest(`tasks?id=eq.${encodeURIComponent(body.task_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'WAITING_QA',outputs:{provider_result:result},updated_at:new Date().toISOString()})});
   }
   return json(200,{ok:true,result});
 }catch(e){console.error(e);return json(502,{error:'AI_PROVIDER_FAILED',message:e.message});}
};
module.exports.callProvider=callProvider;
