const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runAcquisition(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop)return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 const niche=String(body.niche||'').trim();
 const geography=String(body.geography||'UK').trim();
 if(!niche)return {error:'NICHE_REQUIRED'};
 const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,company_name,email,website,status&limit=100`);
 const qualified=(leads||[]).filter(l=>l.status!=='DISQUALIFIED').map(l=>({id:l.id,company_name:l.company_name,email:l.email,website:l.website,fit_score:score(l,niche,geography)})).sort((a,b)=>b.fit_score-a.fit_score);
 for(const lead of qualified.slice(0,25)){
  await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'LEAD_QUALIFIED',source:'acquisition-engine',payload:{...lead,niche,geography}})});
 }
 return {ok:true,niche,geography,qualified_count:qualified.length,top_leads:qualified.slice(0,25)};
}
function score(lead,niche,geography){let s=50;if(lead.website)s+=15;if(lead.email)s+=15;if(String(lead.company_name||'').toLowerCase().includes(niche.toLowerCase()))s+=10;if(geography)s+=10;return Math.min(100,s);}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await runAcquisition(event);return json(result.error?400:200,result);}catch(e){console.error(e);return json(500,{error:'ACQUISITION_ENGINE_FAILED',message:e.message});}};
module.exports.runAcquisition=runAcquisition;
