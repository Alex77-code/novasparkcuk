const { json, verifyUser } = require('./_nova');

const RULES={
 READ:{risk:'LOW',approval:false}, DRAFT:{risk:'LOW',approval:false}, INTERNAL_UPDATE:{risk:'LOW',approval:false},
 PUBLISH:{risk:'HIGH',approval:true}, AD_CHANGE:{risk:'HIGH',approval:true}, DELETE:{risk:'CRITICAL',approval:true}, PAYMENT:{risk:'CRITICAL',approval:true}
};
async function run(event){
 const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});
 const body=JSON.parse(event.body||'{}');const action=String(body.action||'').toUpperCase();
 if(!RULES[action])return json(400,{error:'UNSUPPORTED_ACTION'});
 const rule=RULES[action];
 return json(200,{ok:true,decision:{action,risk:rule.risk,approval_required:rule.approval,execution:rule.approval?'HOLD':'ALLOWED'},policy:{credentials_server_side_only:true,external_publish_requires_approval:true,destructive_actions_require_approval:true},requested_by:user.id||null});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event);}catch(e){console.error(e);return json(500,{error:'AI_DECISION_ENGINE_FAILED'});}};
module.exports.run=run;
