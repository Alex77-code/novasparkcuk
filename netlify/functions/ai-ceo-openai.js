const { json, supabaseRequest } = require('./_nova');
const { requireOwner } = require('./_owner-guard');
async function run(event){
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),message=String(body.message||'').trim();
 if(!org||!message)return json(400,{error:'ORGANIZATION_AND_MESSAGE_REQUIRED'});
 // AI analysis remains available during Emergency Stop; execution remains blocked elsewhere.
 const auth=await requireOwner(event,org,{allowEmergencyStop:true});if(!auth.ok)return auth.response;
 const [leads,campaigns,tasks,assets]=await Promise.all([
  supabaseRequest(`leads?organization_id=eq.${encodeURIComponent(org)}&select=id,stage&limit=1000`),
  supabaseRequest(`campaigns?organization_id=eq.${encodeURIComponent(org)}&select=id,status,channel&limit=1000`),
  supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(org)}&select=id,status,priority&limit=2000`),
  supabaseRequest(`content_assets?organization_id=eq.${encodeURIComponent(org)}&select=id,status,type&limit=1000`)
 ]);
 const context={leads:{total:(leads||[]).length,follow_up:(leads||[]).filter(x=>['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION'].includes(String(x.stage).toUpperCase())).length},campaigns:{total:(campaigns||[]).length,active:(campaigns||[]).filter(x=>String(x.status).toUpperCase()==='ACTIVE').length},tasks:{open:(tasks||[]).filter(x=>!['DONE','COMPLETED','CANCELLED'].includes(String(x.status).toUpperCase())).length,high:(tasks||[]).filter(x=>String(x.priority).toUpperCase()==='HIGH').length},content:{total:(assets||[]).length,review:(assets||[]).filter(x=>['REVIEW','GENERATED'].includes(String(x.status).toUpperCase())).length}};
 const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)return json(503,{error:'OPENAI_API_KEY_NOT_CONFIGURED',context});
 const model=process.env.OPENAI_MODEL||'gpt-5.6';
 const instructions='You are NovaSpark AI CEO for NovaSpark Creative Ltd. Analyze only the supplied business context. Be concise, practical and truthful. Never invent metrics. Recommend priorities and explain why. Never claim to have executed external actions. External publishing, customer messaging, ad spend and platform changes require explicit approval.';
 const input=`Business context:\n${JSON.stringify(context)}\n\nOwner request:\n${message}`;
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,instructions,input,max_output_tokens:900})});
 if(!r.ok){console.error('OpenAI error',r.status);return json(502,{error:'OPENAI_REQUEST_FAILED',context});}
 const data=await r.json();const answer=data.output_text||'No AI response was returned.';
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'AI_CEO_OPENAI_REQUEST',source:'ai-ceo-openai',payload:{message_length:message.length,model}})});
 return json(200,{ok:true,answer,context,external_actions:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'AI_CEO_OPENAI_FAILED'})}};
module.exports.run=run;
