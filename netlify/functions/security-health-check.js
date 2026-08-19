const { json, supabaseRequest, verifyUser } = require('./_nova');

async function securityHealth(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 const checks={
  emergency_stop_available:Boolean(stop),
  ai_provider_configured:Boolean(process.env.NOVA_AI_WORKER_URL&&process.env.NOVA_AI_WORKER_SECRET),
  payment_webhook_secret_configured:Boolean(process.env.NOVA_PAYMENT_WEBHOOK_SECRET),
  cron_secret_configured:Boolean(process.env.NOVA_CRON_SECRET)
 };
 const warnings=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'SECURITY_HEALTH_CHECK',source:'security-health-check',payload:{checks,warnings,checked_at:new Date().toISOString()}})});
 return {ok:true,checks,warnings,production_ready:warnings.length===0};
}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await securityHealth());}catch(e){console.error(e);return json(500,{error:'SECURITY_HEALTH_CHECK_FAILED',message:e.message});}};
module.exports.securityHealth=securityHealth;
