const { json, supabaseRequest, verifyUser } = require('./_nova');

function parseGoal(text=''){
 const m=text.match(/£\s*([\d,]+(?:\.\d+)?)/i); const amount=m?Number(m[1].replace(/,/g,'')):null;
 const lower=text.toLowerCase();
 const horizon=lower.includes('next month')?'NEXT_MONTH':lower.includes('this month')?'THIS_MONTH':null;
 return {amount,currency:'GBP',horizon,raw:text.trim()};
}
async function executeCommand(text){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const goal=parseGoal(text);
 if(!goal.amount) return {ok:true,type:'UNSTRUCTURED',message:'Command received. A structured revenue target requires an amount such as £5000.',goal};
 const existing=(await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_amount,currency,deadline&target_amount=eq.${goal.amount}&limit=1`))?.[0];
 const deadline=goal.horizon==='NEXT_MONTH'?new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()+2,0)).toISOString():null;
 const created=existing||((await supabaseRequest('ceo_goals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:org.id,title:`Revenue target: £${goal.amount}`,description:`CEO command: ${goal.raw}`,target_amount:goal.amount,currency:'GBP',deadline,status:'ACTIVE'})}))?.[0]);
 if(!created) throw new Error('Unable to create CEO goal');
 await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CEO_COMMAND_ACCEPTED',source:'ceo-command',payload:{command:text,goal_id:created.id,amount:goal.amount,horizon:goal.horizon}})});
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'OWNER',action:'CEO_COMMAND',resource_type:'ceo_goals',resource_id:created.id,metadata:{command:text,goal}})});
 return {ok:true,type:'REVENUE_GOAL',goal:created,next:'Revenue Brain should plan acquisition, sales, delivery and retention actions against this goal.'};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});const body=JSON.parse(event.body||'{}');return json(200,await executeCommand(String(body.command||'')));}catch(e){console.error(e);return json(500,{error:'CEO_COMMAND_FAILED',message:e.message});}};
module.exports.executeCommand=executeCommand;
