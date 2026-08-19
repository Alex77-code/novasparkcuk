const { json, supabaseRequest, verifyUser } = require('./_nova');

async function org(){const rows=await supabaseRequest('organizations?select=id,name,currency&name=eq.NovaSpark%20Creative&limit=1');if(!rows?.[0])throw new Error('ORGANIZATION_NOT_FOUND');return rows[0];}
async function auth(event){const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)throw Object.assign(new Error('AUTHENTICATION_REQUIRED'),{status:401});if(process.env.NOVA_OWNER_EMAIL&&user.email!==process.env.NOVA_OWNER_EMAIL)throw Object.assign(new Error('OWNER_ACCESS_REQUIRED'),{status:403});return user;}
exports.handler=async(event)=>{try{const user=await auth(event);const o=await org();const q=event.queryStringParameters||{};const type=q.type||'dashboard';
if(type==='dashboard'){const [companies,leads,opps,activities,proposals,revenue]=await Promise.all([
 supabaseRequest(`companies?organization_id=eq.${o.id}&select=id,name,domain,industry,location,fit_score,marketing_score,estimated_deal_value,source&order=created_at.desc&limit=50`),
 supabaseRequest(`leads?organization_id=eq.${o.id}&select=id,status,score,source,company_id,contact_id,created_at&order=score.desc.nullslast&limit=100`),
 supabaseRequest(`opportunities?organization_id=eq.${o.id}&select=id,name,stage,amount,currency,probability,expected_close_date,service,company_id,next_action,created_at&order=created_at.desc&limit=100`),
 supabaseRequest(`activities?organization_id=eq.${o.id}&select=id,type,subject,occurred_at&order=occurred_at.desc&limit=50`),
 supabaseRequest(`proposals?organization_id=eq.${o.id}&select=id,opportunity_id,status,amount,currency,version,created_at&order=created_at.desc&limit=50`),
 supabaseRequest(`revenue_events?organization_id=eq.${o.id}&select=amount,currency,event_type,channel,occurred_at&order=occurred_at.desc&limit=100`)
]);
const pipeline=opps.reduce((s,x)=>s+(Number(x.amount)||0),0);const weighted=opps.reduce((s,x)=>s+(Number(x.amount)||0)*(Number(x.probability||0)/100),0);const won=opps.filter(x=>x.stage==='WON').reduce((s,x)=>s+(Number(x.amount)||0),0);return json(200,{ok:true,organization:o,metrics:{companies:companies.length,leads:leads.length,qualifiedLeads:leads.filter(x=>x.status==='QUALIFIED').length,meetings:opps.filter(x=>x.stage==='MEETING').length,proposals:proposals.filter(x=>x.status!=='DRAFT').length,pipeline,weightedPipeline:weighted,wonRevenue:won},companies,leads,opportunities:opps,activities,proposals,revenue});}
return json(400,{error:'UNKNOWN_TYPE'});}catch(e){console.error(e);return json(e.status||500,{error:e.message||'REVENUE_ENGINE_FAILED'});}};
