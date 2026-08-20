const { json, supabaseRequest, verifyUser } = require('./_nova');

async function queue(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 const leadIds=Array.isArray(body.lead_ids)?body.lead_ids:[];
 if(!leadIds.length)return {error:'LEAD_IDS_REQUIRED'};
 const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,company_name,email,website,status&id=in.(${leadIds.map(encodeURIComponent).join(',')})`);
 const suppressed=await supabaseRequest(`suppression_list?organization_id=eq.${org.id}&select=*`);
 const blocked=new Set((suppressed||[]).flatMap(x=>[x.email,x.domain]).filter(Boolean).map(String).map(x=>x.toLowerCase()));
 const queued=[];
 for(const lead of leads||[]){
  const email=(lead.email||'').toLowerCase(); const domain=(lead.website||'').replace(/^https?:\/\//,'').split('/')[0].toLowerCase();
  if(!email||blocked.has(email)||blocked.has(domain))continue;
  const existing=await supabaseRequest(`communication_queue?organization_id=eq.${org.id}&task_id=is.null&status=in.(QUEUED,READY_TO_SEND)&select=id&limit=1`);
  if(existing?.length)continue;
  await supabaseRequest('communication_queue',{method:'POST',body:JSON.stringify({organization_id:org.id,channel:'EMAIL',status:'QUEUED',payload:{lead_id:lead.id,company_name:lead.company_name,subject:'NovaSpark Creative — partnership opportunity',requires_review:true,compliance_checked_at:new Date().toISOString()}})});
  queued.push(lead.id);
 }
 return {ok:true,queued:queued.length,lead_ids:queued};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await queue(event);return json(result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'OUTREACH_QUEUE_FAILED',message:e.message});}};
module.exports.queue=queue;
