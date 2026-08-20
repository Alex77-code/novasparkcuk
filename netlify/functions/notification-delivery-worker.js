const { json, supabaseRequest } = require('./_nova');

const CHANNELS=new Set(['IN_APP','EMAIL']);
async function run(event){
 const body=JSON.parse(event.body||'{}');const org=String(body.organization_id||'').trim(),limit=Math.min(Math.max(Number(body.limit||20),1),50);if(!org)return json(400,{error:'ORGANIZATION_REQUIRED'});
 const rows=await supabaseRequest(`notification_queue?organization_id=eq.${encodeURIComponent(org)}&status=eq.QUEUED&select=id,channel,type,payload,created_at&order=created_at.asc&limit=${limit}`);const queue=rows||[];const results=[];
 for(const n of queue){const channel=String(n.channel||'IN_APP').toUpperCase();if(!CHANNELS.has(channel)){results.push({id:n.id,status:'FAILED',reason:'UNSUPPORTED_CHANNEL'});continue;}results.push({id:n.id,status:'READY',channel,delivery:'QUEUED_PROVIDER_DELIVERY'});}
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org,event_type:'NOTIFICATION_DELIVERY_BATCH_PROCESSED',source:'notification-delivery-worker',payload:{total:queue.length,ready:results.filter(x=>x.status==='READY').length,failed:results.filter(x=>x.status==='FAILED').length}})});
 return json(200,{ok:true,processed:results.length,results,next_step:'CONNECT_EMAIL_AND_IN_APP_DELIVERY_ADAPTERS'});
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{return await run(event)}catch(e){console.error(e);return json(500,{error:'NOTIFICATION_WORKER_FAILED'})}};
module.exports.run=run;
