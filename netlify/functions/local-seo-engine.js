const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','MARKETING','SEO','ANALYST']);
const ACTIONS=new Set(['PLAN','AUDIT','LOCATIONS','CITATIONS']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'PLAN').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'LOCAL_SEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='PLAN')return json(200,{ok:true,local_seo_plan:{google_business_profile:['profile completeness','categories','services','hours','photos','posts','reviews'],local_pages:['location pages','NAP consistency','local schema','internal linking'],citations:['directory consistency','duplicate listings','authority citations'],reputation:['review monitoring','response workflow'],reporting:['local visibility','calls','directions','website actions'],external_execution:'APPROVAL_REQUIRED'}});
 if(action==='LOCATIONS'){const locations=Array.isArray(body.locations)?body.locations:[];return json(200,{ok:true,locations:locations.map(x=>({name:x.name||null,address:x.address||null,city:x.city||null,country:x.country||'UK',status:'PLANNING'})),external_gbp_access:false});}
 if(action==='CITATIONS'){const citations=Array.isArray(body.citations)?body.citations:[];return json(200,{ok:true,citations:citations.map(x=>({directory:x.directory||null,name:x.name||null,address:x.address||null,phone:x.phone||null,status:'REVIEW_REQUIRED'})),external_submission:false});}
 const url=String(body.url||'').trim();if(!url)return json(400,{error:'URL_REQUIRED'});return json(200,{ok:true,audit:{url,checks:['NAP consistency','local landing pages','LocalBusiness schema','location metadata','review signals','map visibility'],status:'READY_FOR_PROVIDER_DATA',external_crawl:false}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'LOCAL_SEO_ENGINE_FAILED'})}};
module.exports.run=run;
