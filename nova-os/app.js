let config = null;
let accessToken = localStorage.getItem('nova_access_token');
let orgId = null;

const $ = (id) => document.getElementById(id);
const setStatus = (text, cls='') => { $('auth-status').textContent = text; $('auth-status').className = `status ${cls}`; };

async function loadConfig(){
  const r = await fetch('/.netlify/functions/config');
  config = await r.json();
  if (!config.configured) { setStatus('ACTION REQUIRED: Supabase is not connected in Netlify environment variables.'); return false; }
  return true;
}

async function supabase(path, options={}){
  return fetch(`${config.supabaseUrl}${path}`, { ...options, headers: { apikey: config.supabaseAnonKey, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json', ...(options.headers||{}) }});
}

async function login(e){
  e.preventDefault();
  setStatus('Signing in…');
  if (!await loadConfig()) return;
  const r = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json'}, body:JSON.stringify({email:$('email').value,password:$('password').value}) });
  const data = await r.json();
  if (!r.ok) { setStatus(data.error_description || data.msg || 'Sign-in failed.'); return; }
  accessToken = data.access_token; localStorage.setItem('nova_access_token', accessToken); await boot();
}

async function boot(){
  if (!config && !await loadConfig()) return;
  if (!accessToken) { $('auth').hidden=false; $('app').hidden=true; return; }
  const me = await supabase('/auth/v1/user');
  if (!me.ok) { accessToken=null; localStorage.removeItem('nova_access_token'); $('auth').hidden=false; $('app').hidden=true; setStatus('Session expired. Please sign in again.'); return; }
  const user = await me.json();
  if (config.ownerEmail && user.email !== config.ownerEmail) { accessToken=null; localStorage.removeItem('nova_access_token'); setStatus('OWNER ACCESS REQUIRED'); return; }
  $('auth').hidden=true; $('app').hidden=false; setStatus('');
  await loadState();
}

async function loadState(){
  const h = {apikey:config.supabaseAnonKey,Authorization:`Bearer ${accessToken}`};
  const orgR = await supabase('/rest/v1/organizations?select=id,name&name=eq.NovaSpark%20Creative&limit=1');
  if (!orgR.ok) { $('system-state').textContent='DATABASE ERROR'; return; }
  const orgs=await orgR.json(); if(!orgs[0]) return; orgId=orgs[0].id;
  const [agentsR,tasksR,controlsR,intR,goalsR] = await Promise.all([
    fetch(`${config.supabaseUrl}/rest/v1/agents?organization_id=eq.${orgId}&select=key,name,role,status,metrics&order=name.asc`,{headers:h}),
    fetch(`${config.supabaseUrl}/rest/v1/tasks?organization_id=eq.${orgId}&select=id,status,priority&order=created_at.desc&limit=100`,{headers:h}),
    fetch(`${config.supabaseUrl}/rest/v1/system_controls?organization_id=eq.${orgId}&select=emergency_stop,outbound_enabled,spending_enabled&limit=1`,{headers:h}),
    fetch(`${config.supabaseUrl}/rest/v1/integrations?organization_id=eq.${orgId}&select=provider,status`,{headers:h}),
    fetch(`${config.supabaseUrl}/rest/v1/goals?organization_id=eq.${orgId}&select=target_value,target_currency,forecast,status&order=created_at.desc&limit=10`,{headers:h})
  ]);
  const agents=await agentsR.json(); const tasks=await tasksR.json(); const controls=await controlsR.json(); const integrations=await intR.json(); const goals=await goalsR.json();
  const stop=controls[0]?.emergency_stop;
  $('system-state').textContent=stop?'EMERGENCY STOP':'HEALTHY FOUNDATION';
  $('system-state').className=`pill ${stop?'warning':''}`;
  $('integration-state').textContent=`${integrations.filter(x=>x.status==='CONNECTED').length}/${integrations.length} CONNECTED`;
  $('m-target').textContent=goals[0]?.target_value ? `${goals[0].target_currency||'GBP'} ${Number(goals[0].target_value).toLocaleString()}` : '—';
  $('m-forecast').textContent=goals[0]?.forecast?.value ? `${goals[0].target_currency||'GBP'} ${Number(goals[0].forecast.value).toLocaleString()}` : '—';
  $('m-tasks').textContent=tasks.filter(t=>['PLANNED','PENDING','RUNNING','WAITING_APPROVAL'].includes(t.status)).length;
  $('agent-count').textContent=`${agents.length} AGENTS`;
  $('agents').innerHTML=agents.map(a=>`<div class="agent"><strong><span class="status-dot ${String(a.status).toLowerCase()}"></span>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.role)} · ${escapeHtml(a.status)}</small></div>`).join('');
  $('issues').innerHTML = stop ? '<div class="issue">Emergency stop is active. Outbound and spending workflows remain halted until explicitly re-enabled.</div>' : '<div class="empty">No critical issues reported by the foundation layer.</div>';
}

async function command(e){
  e.preventDefault();
  const commandText=$('command').value.trim(); if(!commandText)return;
  $('run-state').textContent='RUNNING'; $('response').textContent='NOVA CEO is analysing company state and creating an execution plan…';
  const r=await fetch('/.netlify/functions/ceo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},body:JSON.stringify({command:commandText})});
  const data=await r.json();
  if(!r.ok){$('run-state').textContent='FAILED';$('response').textContent=JSON.stringify(data,null,2);return;}
  $('run-state').textContent='COMPLETED';$('response').textContent=JSON.stringify(data,null,2); $('command').value=''; await loadState();
}

async function emergencyStop(){
  if(!orgId) return;
  if(!confirm('Activate EMERGENCY STOP? This halts outbound and spending workflows.')) return;
  const r=await fetch(`${config.supabaseUrl}/rest/v1/system_controls?organization_id=eq.${orgId}`,{method:'PATCH',headers:{apikey:config.supabaseAnonKey,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({emergency_stop:true,outbound_enabled:false,spending_enabled:false,updated_at:new Date().toISOString()})});
  if(!r.ok) alert('Emergency stop could not be updated. Check database policies.');
  await loadState();
}

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

$('login-form').addEventListener('submit',login); $('command-form').addEventListener('submit',command); $('stop').addEventListener('click',emergencyStop); $('logout').addEventListener('click',()=>{localStorage.removeItem('nova_access_token');location.reload();});
loadConfig().then(()=>boot()).catch(e=>setStatus(`Configuration error: ${e.message}`));
