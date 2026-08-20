const { json, supabaseRequest, verifyUser } = require('./_nova');

function scoreLead(lead, icp={}){
 let score=0;
 if(lead.website) score+=15;
 if(lead.email) score+=15;
 if(lead.company_name) score+=10;
 const text=`${lead.company_name||''} ${lead.website||''}`.toLowerCase();
 for(const keyword of (Array.isArray(icp.keywords)?icp.keywords:[])) if(text.includes(String(keyword).toLowerCase())) score+=10;
 if(icp.geography && text.includes(String(icp.geography).toLowerCase())) score+=10;
 return Math.min(100,score);
}

async function run(event){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const body=JSON.parse(event.body||'{}');
 const icp=body.icp||{geography:'UK',keywords:['digital','marketing','ecommerce','agency','business']};
 const leads=await supabaseRequest(`leads?organization_id=eq.${org.id}&select=id,company_name,email,website,status&limit=200`);
 const scored=(leads||[]).map(l=>({...l,fit_score:scoreLead(l,icp)})).sort((a,b)=>b.fit_score-a.fit_score);
 for(const lead of scored){await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'LEAD_SCORED',source:'lead-scoring-engine',payload:{lead_id:lead.id,fit_score:lead.fit_score,icp}})});}
 return {ok:true,icp,scored_count:scored.length,top_leads:scored.slice(0,25)};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const result=await run(event);return json(200,result);}catch(e){console.error(e);return json(500,{error:'LEAD_SCORING_FAILED',message:e.message});}};
module.exports.run=run;
