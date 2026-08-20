const { json, supabaseRequest } = require('./_nova');

function validSecret(event){return Boolean(process.env.NOVA_PAYMENT_WEBHOOK_SECRET)&&event.headers?.['x-nova-payment-secret']===process.env.NOVA_PAYMENT_WEBHOOK_SECRET;}
async function provision(event){
 if(!validSecret(event))return {statusCode:401,body:{error:'INVALID_WEBHOOK_SIGNATURE'}};
 const body=JSON.parse(event.body||'{}'); const {organization_id,project_id,lead_id,event_id}=body;
 if(!organization_id||!project_id||!lead_id||!event_id)return {statusCode:400,body:{error:'INVALID_ONBOARDING_PAYLOAD'}};
 const existing=await supabaseRequest(`tasks?organization_id=eq.${encodeURIComponent(organization_id)}&project_id=eq.${encodeURIComponent(project_id)}&select=id&limit=1`);
 if(existing?.length)return {statusCode:200,body:{ok:true,already_provisioned:true}};
 const checklist=[
  ['CLIENT_ONBOARDING','Collect client brief, goals and primary contacts'],
  ['ACCESS_COLLECTION','Collect approved website, analytics and advertising access'],
  ['STRATEGY_BASELINE','Create initial marketing baseline and KPI targets'],
  ['CAMPAIGN_PLAN','Create first 30-day execution plan'],
  ['QA_SETUP','Create project QA and reporting requirements']
 ];
 const created=[];
 for(const [type,title] of checklist){
  const rows=await supabaseRequest('tasks',{method:'POST',body:JSON.stringify({organization_id,project_id,title,status:'PENDING',task_type:type,metadata:{lead_id,provisioned_from:event_id,automated:true}})});
  if(rows?.[0])created.push(rows[0]);
 }
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id,event_type:'CLIENT_ONBOARDING_CHECKLIST_CREATED',source:'client-onboarding-provisioner',payload:{project_id,lead_id,event_id,task_count:created.length,created_at:new Date().toISOString()}})});
 return {statusCode:200,body:{ok:true,project_id,created_tasks:created.length}};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const r=await provision(event);return json(r.statusCode,r.body);}catch(e){console.error(e);return json(500,{error:'ONBOARDING_PROVISIONING_FAILED'});}};
module.exports.provision=provision;
