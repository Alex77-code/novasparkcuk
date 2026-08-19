const { json, supabaseRequest, verifyUser } = require('./_nova');

async function runAutonomousLoop(){
 const org=(await supabaseRequest('organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1'))?.[0];
 if(!org) throw new Error('NovaSpark organization not found');
 const stop=(await supabaseRequest(`system_controls?organization_id=eq.${org.id}&select=emergency_stop&limit=1`))?.[0];
 if(stop?.emergency_stop) return {skipped:true,reason:'EMERGENCY_STOP'};
 const goals=await supabaseRequest(`ceo_goals?organization_id=eq.${org.id}&status=eq.ACTIVE&select=id,title,target_amount,currency,deadline&order=created_at.desc&limit=20`);
 const tasks=await supabaseRequest(`tasks?organization_id=eq.${org.id}&select=id,status,priority,inputs,updated_at&order=updated_at.desc&limit=1000`);
 const events=await supabaseRequest(`events?organization_id=eq.${org.id}&select=event_type,payload,created_at&order=created_at.desc&limit=200`);
 const actions=[];
 for(const goal of goals||[]){
   const goalTasks=(tasks||[]).filter(t=>t.inputs?.goal_id===goal.id);
   const active=goalTasks.filter(t=>['QUEUED','IN_PROGRESS','WAITING_APPROVAL'].includes(t.status)).length;
   const failed=goalTasks.filter(t=>t.status==='FAILED').length;
   if(active===0 && failed===0) actions.push({type:'REPLAN_REQUIRED',goal_id:goal.id,reason:'No active execution tasks'});
   if(failed>0) actions.push({type:'RECOVERY_REQUIRED',goal_id:goal.id,failed_tasks:failed});
 }
 for(const action of actions){await supabaseRequest('events',{method:'POST',body:JSON.stringify({organization_id:org.id,event_type:'CEO_LOOP_ACTION',source:'autonomous-loop',payload:action})});}
 await supabaseRequest('audit_logs',{method:'POST',body:JSON.stringify({organization_id:org.id,actor_type:'NOVA_CEO',action:'AUTONOMOUS_LOOP_RUN',resource_type:'ceo_goals',metadata:{active_goals:(goals||[]).length,actions:actions.length,recent_events:(events||[]).length}})});
 return {ok:true,active_goals:(goals||[]).length,actions,recent_events:(events||[]).length};
}
exports.handler=async event=>{if(event.httpMethod!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});try{const user=await verifyUser(event.headers.authorization||event.headers.Authorization);if(!user)return json(401,{error:'AUTHENTICATION_REQUIRED'});return json(200,await runAutonomousLoop());}catch(e){console.error(e);return json(500,{error:'AUTONOMOUS_LOOP_FAILED',message:e.message});}};
module.exports.runAutonomousLoop=runAutonomousLoop;
