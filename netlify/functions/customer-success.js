const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runCustomerSuccess(){
  const org=(await supabaseRequest('organizations?select=id&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
  if(!org) throw new Error('NovaSpark organization not found');
  const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
  if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
  const companies=await supabaseRequest(`companies?organization_id=eq.${org.id}&select=*&order=updated_at.desc&limit=100`);
  const opportunities=await supabaseRequest(`opportunities?organization_id=eq.${org.id}&select=*&order=updated_at.desc&limit=100`);
  const projects=await supabaseRequest(`delivery_projects?organization_id=eq.${org.id}&select=*&order=updated_at.desc&limit=100`);
  const signals=[];
  for(const company of companies||[]){
    const deals=(opportunities||[]).filter(o=>o.company_id===company.id && o.stage==='WON');
    if(!deals.length) continue;
    const active=(projects||[]).filter(p=>p.client_company_id===company.id && !['COMPLETED','CANCELLED'].includes(p.status));
    const completed=(projects||[]).filter(p=>p.client_company_id===company.id && p.status==='COMPLETED');
    if(completed.length && !active.length){
      signals.push({company_id:company.id,type:'RENEWAL_OR_UPSELL',priority:70,reason:'Completed client work with no active delivery project',recommended_action:'Review results and prepare a renewal or complementary-service proposal.'});
    }
    if(active.some(p=>p.qa_status==='FAILED')) signals.push({company_id:company.id,type:'CLIENT_RISK',priority:95,reason:'Delivery QA failure',recommended_action:'Resolve QA issue before any client-facing release.'});
    if(active.some(p=>p.owner_review_status==='PENDING')) signals.push({company_id:company.id,type:'OWNER_REVIEW',priority:90,reason:'Client delivery waiting for owner approval',recommended_action:'Review and approve or reject the delivery package.'});
  }
  for(const s of signals){ await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:`CUSTOMER_${s.type}`,source:'customer-success',payload:s})}); }
  await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CSO',action:'CUSTOMER_SUCCESS_SCAN',resource_type:'companies',metadata:{signals:signals.length,types:signals.reduce((a,s)=>(a[s.type]=(a[s.type]||0)+1,a),{})}})});
  return {ok:true,signals};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runCustomerSuccess());}catch(e){console.error(e);return json(500,{error:'CUSTOMER_SUCCESS_FAILED',message:e.message});}};
module.exports.runCustomerSuccess=runCustomerSuccess;
