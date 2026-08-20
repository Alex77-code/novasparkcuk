const { json, supabaseRequest, verifyUser } = require('./_nova');

const PRICING={SEO:{starter:299,business:499,premium:799},CONTENT:{starter:249,business:449,premium:699},SOCIAL_MEDIA:{starter:299,business:549,premium:899},ADS:{starter:399,business:699,premium:1099},WEBSITE:{starter:599,business:999,premium:1499},EMAIL:{starter:199,business:399,premium:699},ANALYTICS:{starter:249,business:449,premium:749}};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),leadId=String(body.lead_id||'').trim(),proposalId=String(body.proposal_id||'').trim(),service=String(body.service_type||'SEO').toUpperCase(),tier=String(body.tier||'business').toLowerCase();
 if(!org||!leadId||!PRICING[service]||PRICING[service][tier]===undefined)return json(400,{error:'INVALID_QUOTE_REQUEST'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 const amount=PRICING[service][tier];const quote={organization_id:org,lead_id:leadId,proposal_id:proposalId||null,service_type:service,tier,amount_gbp:amount,currency:'GBP',status:'DRAFT',requires_approval:true,created_by:user.id||null,created_at:new Date().toISOString()};
 const rows=await supabaseRequest('quotes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(quote)});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'QUOTE_DRAFT_CREATED',source:'pricing-quote-engine',payload:{lead_id:leadId,proposal_id:proposalId||null,quote_id:rows?.[0]?.id||null,service_type:service,tier,amount_gbp:amount,requires_approval:true}})});
 return json(200,{ok:true,quote_id:rows?.[0]?.id||null,amount_gbp:amount,currency:'GBP',status:'DRAFT',requires_approval:true});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PRICING_QUOTE_FAILED',message:e.message});}};
module.exports.run=run;
