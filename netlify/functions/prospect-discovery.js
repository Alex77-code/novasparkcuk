const { json, supabaseRequest, verifyUser } = require('./_nova');

async function discover(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 const prospects=Array.isArray(body.prospects)?body.prospects:[];
 const seen=new Set(); const created=[];
 for(const p of prospects){
  const name=String(p.company_name||'').trim(); const email=String(p.email||'').trim().toLowerCase(); const website=String(p.website||'').trim();
  const key=email||website||name.toLowerCase(); if(!key||seen.has(key))continue; seen.add(key);
  const existing=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=id&limit=1&or=(email.eq.${encodeURIComponent(email)},website.eq.${encodeURIComponent(website)})`);
  if(existing?.length)continue;
  const row=(await supabaseRequest('leads',{method:'POST',body:JSON.stringify({organization_id:org.id,company_name:name,email:email||null,website:website||null,status:'NEW',source:'prospect-discovery'})}));
  if(row?.[0])created.push(row[0]);
 }
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'PROSPECTS_IMPORTED',source:'prospect-discovery',payload:{received:prospects.length,created:created.length}})});
 return {ok:true,received:prospects.length,created:created.length,leads:created};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await discover(event);return json(200,result);}catch(e){console.error(e);return json(500,{error:'PROSPECT_DISCOVERY_FAILED',message:e.message});}};
module.exports.discover=discover;
