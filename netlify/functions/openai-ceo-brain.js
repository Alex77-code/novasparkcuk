const { json, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),message=String(body.message||'').trim();if(!org||!message)return json(400,{error:'ORGANIZATION_AND_MESSAGE_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 if(!process.env.OPENAI_API_KEY)return json(503,{error:'OPENAI_NOT_CONFIGURED',message:'Set OPENAI_API_KEY in the server environment before enabling the live AI CEO brain.'});
 const model=process.env.OPENAI_MODEL||'gpt-5';
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model,input:[{role:'system',content:'You are NovaSpark Creative Ltd AI CEO. Give concise, commercially useful business recommendations. Never claim an external action was executed unless the execution tool confirms it. Respect approval gates and emergency stop.'},{role:'user',content:`Organization: ${org}\nUser request: ${message}`}],store:false})});
 const data=await response.json();if(!response.ok)return json(response.status,{error:'OPENAI_REQUEST_FAILED',provider_error:data?.error?.message||'Unknown provider error'});
 return json(200,{ok:true,model,answer:data.output_text||'',response_id:data.id||null,external_actions:false});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'OPENAI_CEO_BRAIN_FAILED'})}};
module.exports.run=run;
