const { json } = require('./_nova');

const CONFIG={
 GOOGLE:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',envClient:'GOOGLE_CLIENT_ID',envSecret:'GOOGLE_CLIENT_SECRET',scopes:['openid','email','profile']},
 META:{authorize:'https://www.facebook.com/v23.0/dialog/oauth',envClient:'META_APP_ID',envSecret:'META_APP_SECRET',scopes:['public_profile','email']},
 EMAIL:{authorize:null,envClient:'EMAIL_CLIENT_ID',envSecret:'EMAIL_CLIENT_SECRET',scopes:[]},
 WHATSAPP:{authorize:'https://www.facebook.com/v23.0/dialog/oauth',envClient:'META_APP_ID',envSecret:'META_APP_SECRET',scopes:['whatsapp_business_management','whatsapp_business_messaging']},
 ANALYTICS:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',envClient:'GOOGLE_CLIENT_ID',envSecret:'GOOGLE_CLIENT_SECRET',scopes:['openid','email','https://www.googleapis.com/auth/analytics.readonly']}
};
function getProvider(provider){const key=String(provider||'').toUpperCase();const c=CONFIG[key];if(!c)return null;return {provider:key,authorize:c.authorize,client_id_configured:Boolean(process.env[c.envClient]),secret_configured:Boolean(process.env[c.envSecret]),scopes:c.scopes};}
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});const provider=event.queryStringParameters?.provider;const cfg=getProvider(provider);if(!cfg)return json(400,{error:'INVALID_PROVIDER'});return json(200,{ok:true,...cfg,secret_exposed:false});};
module.exports.getProvider=getProvider;
