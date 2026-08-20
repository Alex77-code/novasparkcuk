const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),clientId=String(body.client_id||'').trim();if(!org||!clientId)return json(400,{error:'ORGANIZATION_AND_CLIENT_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const client=(await supabaseRequest(`clients?id=eq.${encodeURIComponent(clientId)}&organization_id=eq.${encodeURIComponent(org)}&select=id,name,email,status,services,goals&limit=1`))?.[0];if(!client)return json(404,{error:'CLIENT_NOT_FOUND'});
 const requested=Array.isArray(body.sections)?body.sections:[];const sections=requested.length?requested:['projects','invoices','payments','approvals','reports'];
 const data={client,sections:{}};
 if(sections.includes('projects'))data.sections.projects=await supabaseRequest(`projects?organization_id=eq.${encodeURIComponent(org)}&client_id=eq.${encodeURIComponent(clientId)}&select=id,name,status,created_at,updated_at&limit=100`);
 if(sections.includes('invoices'))data.sections.invoices=await supabaseRequest(`invoices?organization_id=eq.${encodeURIComponent(org)}&client_id=eq.${encodeURIComponent(clientId)}&select=id,invoice_number,total,currency,status,due_date&order=created_at.desc&limit=100`);
 if(sections.includes('payments'))data.sections.payments=await supabaseRequest(`payment_sessions?organization_id=eq.${encodeURIComponent(org)}&invoice_id=in.(${(data.sections.invoices||[]).map(x=>x.id).join(',')||'00000000-0000-0000-0000-000000000000'})&select=id,invoice_id,provider,status,amount,currency,created_at&order=created_at.desc&limit=100`);
 if(sections.includes('approvals'))data.sections.approvals=await supabaseRequest(`approvals?organization_id=eq.${encodeURIComponent(org)}&client_id=eq.${encodeURIComponent(clientId)}&select=id,status,type,created_at,updated_at&order=created_at.desc&limit=100`);
 if(sections.includes('reports'))data.sections.reports=await supabaseRequest(`reports?organization_id=eq.${encodeURIComponent(org)}&client_id=eq.${encodeURIComponent(clientId)}&select=id,title,period,created_at&order=created_at.desc&limit=100`);
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'CLIENT_PORTAL_VIEWED',source:'client-portal-engine',payload:{client_id:clientId,sections}})});
 return json(200,{ok:true,portal:data});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'CLIENT_PORTAL_FAILED'});}};
module.exports.run=run;
