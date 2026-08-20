const { json, required } = require('./_nova');
exports.handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return json(200,{url:required('SUPABASE_URL'),anonKey:required('SUPABASE_ANON_KEY')})}catch(e){return json(503,{error:'AUTH_CONFIG_NOT_CONFIGURED'})}};
