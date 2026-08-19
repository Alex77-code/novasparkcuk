let config = null;
let accessToken = localStorage.getItem('nova_access_token');
let orgId = null;
const $ = (id) => document.getElementById(id);
const setStatus = (text, cls='') => { $('auth-status').textContent=text; $('auth-status').className=`status ${cls}`; };

async function loadConfig(){
  const r=await fetch('/.netlify/functions/config'); config=await r.json();
  if(!config.configured){setStatus('ACTION REQUIRED: Supabase is not connected in Netlify environment variables.');return false;} return true;
}
async function authUser(){
  const r=await fetch(`${config.supabaseUrl}/auth/v1/user`,{headers:{apikey:config.supabaseAnonKey,Authorization:`Bearer ${accessToken}`}}); return r;
}
async function login(e){
  e.preventDefault(); setStatus('Signing in…'); if(!await loadConfig())return;
  const r=await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});
  const data=await r.json(); if(!r.ok){setStatus(data.error_description||data.msg||'Sign-in failed.');return;}
  accessToken=data.access_token;localStorage.setItem('nova_access_token',accessToken);await boot();
}
async function boot(){
  if(!config&&!await loadConfig())return;
  if(!accessToken){$('auth').hidden=false;$('app').hidden=true;return;}
  const me=await authUser();
  if(!me.ok){accessToken=null;localStorage.removeItem('nova_access_token');$('auth').hidden=false;$('app').hidden=true;setStatus('Session expired. Please sign in again.');return;}
  const user=await me.json();
  if(config.ownerEmail&&user.email!==config.ownerEmail){accessToken=null;localStorage.removeItem('nova_access_token');setStatus('OWNER ACCESS REQUIRED');return;}
  $('auth').hidden=true;$('app').hidden=false;setStatus('');await loadState();
}
async function loadState(){
  const r=await fetch('/.netlify/functions/state',{headers:{Authorization:`Bearer ${accessToken}`}}); const data=await r.json();
  if(!r.ok){$('system-state').textContent=data.error||'STATE ERROR';return;}
  orgId=data.org.id; const stop=data.controls?.emergency_stop;
  $('system-state').textContent=stop?'EMERGENCY STOP':'HEALTHY FOUNDATION';$('system-state').className=`pill ${stop?'warning':''}`;
  $('integration-state').textContent=`${data.integrations.filter(x=>x.status==='CONNECTED').length}/${data.integrations.length} CONNECTED`;
  const goal=data.goals[0];
  $('m-target').textContent=goal?.target_value?`${goal.target_currency||'GBP'} ${Number(goal.target_value).toLocaleString()}`:'—';
  $('m-forecast').textContent=goal?.forecast?.value?`${goal.target_currency||'GBP'} ${Number(goal.forecast.value).toLocaleString()}`:'—';
  $('m-tasks').textContent=data.tasks.filter(t=>['PLANNED','PENDING','RUNNING','WAITING_APPROVAL'].includes(t.status)).length;
  $('agent-count').textContent=`${data.agents.length} AGENTS`;
  $('agents').innerHTML=data.agents.map(a=>`<div class="agent"><strong><span class="status-dot ${String(a.status).toLowerCase()}"></span>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.role)} · ${escapeHtml(a.status)}</small></div>`).join('');
  $('issues').innerHTML=stop?'<div class="issue">Emergency stop is active. Outbound and spending workflows remain halted.</div>':'<div class="empty">No critical issues reported by the foundation layer.</div>';
}
async function command(e){
  e.preventDefault();const commandText=$('command').value.trim();if(!commandText)return;
  $('run-state').textContent='RUNNING';$('response').textContent='NOVA CEO is analysing company state and creating an execution plan…';
  const r=await fetch('/.netlify/functions/ceo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},body:JSON.stringify({command:commandText})});
  const data=await r.json();if(!r.ok){$('run-state').textContent='FAILED';$('response').textContent=JSON.stringify(data,null,2);return;}
  $('run-state').textContent='COMPLETED';$('response').textContent=JSON.stringify(data,null,2);$('command').value='';await loadState();
}
async function emergencyStop(){
  if(!confirm('Activate EMERGENCY STOP? This halts outbound and spending workflows.'))return;
  const r=await fetch('/.netlify/functions/emergency-stop',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`}});
  if(!r.ok){const d=await r.json();alert(d.message||d.error||'Emergency stop failed.');return;} await loadState();
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
$('login-form').addEventListener('submit',login);$('command-form').addEventListener('submit',command);$('stop').addEventListener('click',emergencyStop);$('logout').addEventListener('click',()=>{localStorage.removeItem('nova_access_token');location.reload();});
loadConfig().then(()=>boot()).catch(e=>setStatus(`Configuration error: ${e.message}`));
