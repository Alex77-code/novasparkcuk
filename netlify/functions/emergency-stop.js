const { json, supabaseRequest, verifyUser } = require('./_nova');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
  try {
    const user=await verifyUser(event.headers.authorization||event.headers.Authorization);
    if(!user) return json(401,{error:'AUTHENTICATION_REQUIRED'});
    if(process.env.NOVA_OWNER_EMAIL && user.email!==process.env.NOVA_OWNER_EMAIL) return json(403,{error:'OWNER_ACCESS_REQUIRED'});
    const orgs=await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1');
    if(!orgs?.[0]) return json(404,{error:'ORGANIZATION_NOT_FOUND'});
    const result=await supabaseRequest(`system_controls?organization_id=eq.${orgs[0].id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({emergency_stop:true,outbound_enabled:false,spending_enabled:false,updated_at:new Date().toISOString()})});
    await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:orgs[0].id,actor_type:'OWNER',actor_id:user.id,action:'EMERGENCY_STOP_ACTIVATED',resource_type:'system_controls',metadata:{}})});
    return json(200,{ok:true,controls:result?.[0]||null});
  }catch(error){console.error(error);return json(500,{error:'EMERGENCY_STOP_FAILED',message:error.message});}
};
