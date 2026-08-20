const { json, verifyUser } = require('./_nova');

const ADAPTERS={
 google_ads:{env:['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_DEVELOPER_TOKEN'],capabilities:['campaign_read','campaign_draft','metrics_read']},
 meta_ads:{env:['META_APP_ID','META_APP_SECRET','META_ACCESS_TOKEN'],capabilities:['campaign_read','campaign_draft','metrics_read']},
 analytics:{env:['ANALYTICS_PROPERTY_ID'],capabilities:['metrics_read','report_read']},
 cms:{env:['CMS_API_URL','CMS_API_TOKEN'],capabilities:['content_draft','publish_requires_approval']},
 social:{env:['SOCIAL_API_URL','SOCIAL_API_TOKEN'],capabilities:['content_draft','publish_requires_approval']}
};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const provider=String(body.provider||'').toLowerCase();
 if(!ADAPTERS[provider])return json(400,{error:'UNSUPPORTED_PROVIDER'});
 const config=ADAPTERS[provider];const configured=config.env.filter(k=>Boolean(process.env[k]));
 return json(200,{ok:true,provider,configured:configured.length===config.env.length,capabilities:config.capabilities,missing_env:config.env.filter(k=>!process.env[k]),safety:{external_publish:'APPROVAL_REQUIRED',credentials:'SERVER_SIDE_ONLY'}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'PROVIDER_REGISTRY_FAILED'});}};
module.exports.run=run;
