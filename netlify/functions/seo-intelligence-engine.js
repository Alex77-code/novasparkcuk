const { json, supabaseRequest, verifyUser } = require('./_nova');
const ROLES=new Set(['OWNER','ADMIN','MANAGER','OPERATIONS','MARKETING','SEO','ANALYST']);
const ACTIONS=new Set(['AUDIT','KEYWORDS','OPPORTUNITIES','PLAN']);
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),action=String(body.action||'PLAN').toUpperCase();if(!org||!ACTIONS.has(action))return json(400,{error:'ORGANIZATION_AND_VALID_ACTION_REQUIRED'});
 const allowed=Array.isArray(user.organization_ids)?user.organization_ids.includes(org):user.organization_id===org;if(!allowed)return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
 const memberships=await supabaseRequest(`organization_members?organization_id=eq.${encodeURIComponent(org)}&user_id=eq.${encodeURIComponent(user.id||'')}&select=role&limit=1`);const role=String(memberships?.[0]?.role||user.role||'VIEWER').toUpperCase();if(!ROLES.has(role))return json(403,{error:'SEO_ROLE_REQUIRED'});
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${encodeURIComponent(org)}&select=emergency_stop&limit=1`))?.[0];if(stop?.emergency_stop)return json(200,{skipped:true,reason:'EMERGENCY_STOP'});
 if(action==='AUDIT'){const url=String(body.url||'').trim();if(!url)return json(400,{error:'URL_REQUIRED'});return json(200,{ok:true,audit:{url,checks:['title','meta description','canonical','indexability','headings','structured data','internal links','image alt text','page speed'],status:'READY_FOR_CRAWLER',external_crawl:false}})}
 if(action==='KEYWORDS'){const keywords=Array.isArray(body.keywords)?body.keywords.map(x=>String(x).trim()).filter(Boolean):[];return json(200,{ok:true,keywords:keywords.map(keyword=>({keyword,intent:'UNCLASSIFIED',priority:'REVIEW_REQUIRED',source:'USER_PROVIDED'})),external_keyword_provider:false})}
 if(action==='OPPORTUNITIES'){const rows=await supabaseRequest(`content_assets?organization_id=eq.${encodeURIComponent(org)}&select=id,title,status,keywords&limit=500`);return json(200,{ok:true,opportunities:(rows||[]).map(x=>({asset_id:x.id,title:x.title,status:x.status,opportunity:'REVIEW_KEYWORDS_AND_ON_PAGE_OPTIMIZATION'}))})}
 return json(200,{ok:true,seo_plan:{technical_seo:['crawlability','indexation','canonicalization','structured data'],on_page:['titles','meta descriptions','headings','internal linking','image optimization'],content:['keyword mapping','search intent','content gaps'],off_page:['backlink analysis','local citations'],reporting:['rankings','organic traffic','conversions'],external_execution:'APPROVAL_REQUIRED'}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'SEO_ENGINE_FAILED'})}};
module.exports.run=run;
