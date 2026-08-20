const { json, supabaseRequest } = require('./_nova');

async function run(event){
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),status=String(body.status||'').toUpperCase();if(!org||!status)return json(400,{error:'ORGANIZATION_AND_STATUS_REQUIRED'});
 if(!['HEALTHY','DEGRADED','DOWN'].includes(status))return json(400,{error:'INVALID_STATUS'});
 const severity=status==='DOWN'?'CRITICAL':status==='DEGRADED'?'HIGH':'INFO';
 if(status==='HEALTHY')return json(200,{ok:true,incident_created:false,status,severity});
 const rows=await supabaseRequest('incidents',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org,status:'OPEN',severity,source:'production-monitor',summary:`Production system ${status.toLowerCase()}`,details:body.details||{},created_at:new Date().toISOString()})});
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'PRODUCTION_INCIDENT_CREATED',source:'incident-alert-system',payload:{incident_id:rows?.[0]?.id||null,status,severity}})});
 return json(200,{ok:true,incident_created:true,incident:rows?.[0]||null,alert:{status:'QUEUED',channels:['IN_APP','EMAIL']}});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'INCIDENT_ALERT_FAILED'})}};
module.exports.run=run;
