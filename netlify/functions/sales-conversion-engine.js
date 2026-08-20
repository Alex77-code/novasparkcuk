const { json, supabaseRequest, verifyUser } = require('./_nova');

async function run(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 const leadId=String(body.lead_id||'').trim();
 const action=String(body.action||'').toUpperCase();
 if(!leadId||!['QUALIFY','PROPOSAL','WON','LOST'].includes(action))return {error:'INVALID_SALES_ACTION'};
 const lead=(await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}&organization_id=eq.${org.id}&select=id,company_name,status&limit=1`))?.[0];
 if(!lead)return {error:'LEAD_NOT_FOUND'};
 const now=new Date().toISOString();
 const map={QUALIFY:'QUALIFIED',PROPOSAL:'PROPOSAL',WON:'WON',LOST:'LOST'};
 await supabaseRequest(`leads?id=eq.${encodeURIComponent(lead.id)}&organization_id=eq.${org.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:map[action],updated_at:now})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'SALES_STAGE_CHANGED',source:'sales-conversion-engine',payload:{lead_id:lead.id,company_name:lead.company_name,from_status:lead.status,to_status:map[action],action,changed_at:now}})});
 return {ok:true,lead_id:lead.id,status:map[action]};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await run(event);return json(result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'SALES_CONVERSION_FAILED',message:e.message});}};
module.exports.run=run;
