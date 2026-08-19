const WA='447449793617';
const modal=document.getElementById('modal');
const nav=document.getElementById('navlinks');
const hamb=document.getElementById('hamb');
const steps=[...document.querySelectorAll('.step')];
const progress=document.getElementById('progress');
const stepLabel=document.getElementById('stepLabel');
const title=document.getElementById('widgetTitle');
const sub=document.getElementById('widgetSub');
const next=document.getElementById('next');
const back=document.getElementById('back');
const error=document.getElementById('error');
const summary=document.getElementById('summary');
let current=1;
const state={services:new Set(),goal:'',budget:''};

function openModal(service=''){
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  current=1;
  if(service){
    const b=[...document.querySelectorAll('#servicesOptions button')].find(x=>x.dataset.v===service);
    if(b){state.services.add(service);b.classList.add('selected');}
  }
  update();
}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';}

document.querySelectorAll('.open-widget').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.service||'')));
document.querySelectorAll('[data-service]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.service)));
document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closeModal));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))closeModal();});

if(hamb){
  hamb.addEventListener('click',()=>{const open=nav.classList.toggle('open');hamb.setAttribute('aria-expanded',String(open));});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
}

function wireMulti(id,key){
  document.querySelectorAll(`#${id} button`).forEach(b=>b.addEventListener('click',()=>{
    if(state[key].has(b.dataset.v)){state[key].delete(b.dataset.v);b.classList.remove('selected');}
    else{state[key].add(b.dataset.v);b.classList.add('selected');}
    error.textContent='';
  }));
}
function wireSingle(id,key){
  document.querySelectorAll(`#${id} button`).forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll(`#${id} button`).forEach(x=>x.classList.remove('selected'));
    state[key]=b.dataset.v;b.classList.add('selected');error.textContent='';
  }));
}
wireMulti('servicesOptions','services');
wireSingle('goalOptions','goal');
wireSingle('budgetOptions','budget');

function update(){
  steps.forEach(s=>s.classList.toggle('active',Number(s.dataset.step)===current));
  progress.style.width=`${current*20}%`;
  stepLabel.textContent=`STEP ${current} OF 5`;
  const meta=[
    ['What can we help you with?','Select one or more services.'],
    ['What is your main goal?','Choose the outcome that matters most.'],
    ['Tell us about your business','A few details help us make the conversation useful.'],
    ['What level of investment are you considering?','Choose the closest project budget.'],
    ['Your enquiry is ready','Review your details before opening WhatsApp.']
  ][current-1];
  title.textContent=meta[0];sub.textContent=meta[1];
  back.style.visibility=current===1?'hidden':'visible';
  next.textContent=current===5?'Continue to WhatsApp →':'Continue →';
  error.textContent='';
  if(current===5) updateSummary();
}

function updateSummary(){
  const val=id=>document.getElementById(id)?.value.trim()||'Not provided';
  summary.innerHTML=`<b>Enquiry summary</b><div class="summary-grid"><span>Services</span><strong>${[...state.services].join(', ')||'Not selected'}</strong><span>Main goal</span><strong>${state.goal||'Not selected'}</strong><span>Name</span><strong>${val('fName')}</strong><span>Business</span><strong>${val('fBusiness')}</strong><span>Email</span><strong>${val('fEmail')}</strong><span>Phone</span><strong>${val('fPhone')}</strong><span>Budget</span><strong>${state.budget||'Not selected'}</strong></div>`;
}

function validStep(){
  if(current===1&&!state.services.size){error.textContent='Please select at least one service.';return false;}
  if(current===2&&!state.goal){error.textContent='Please select your main goal.';return false;}
  if(current===3){
    for(const id of ['fName','fBusiness','fEmail','fPhone']){
      const el=document.getElementById(id);
      if(!el.value.trim()){error.textContent='Please complete the required fields.';el.focus();return false;}
    }
    const email=document.getElementById('fEmail');
    if(!email.checkValidity()){error.textContent='Please enter a valid email address.';email.focus();return false;}
  }
  if(current===4&&!state.budget){error.textContent='Please select a budget range.';return false;}
  return true;
}

next.addEventListener('click',()=>{
  if(!validStep())return;
  if(current<5){current++;update();if(current===5)updateSummary();}
  else sendWhatsApp();
});
back.addEventListener('click',()=>{if(current>1){current--;update();}});

function sendWhatsApp(){
  const v=id=>document.getElementById(id)?.value.trim()||'Not provided';
  const text=`Hello NovaSpark Creative Ltd,\n\nI'd like to discuss a digital marketing project.\n\nName: ${v('fName')}\nBusiness: ${v('fBusiness')}\nEmail: ${v('fEmail')}\nPhone / WhatsApp: ${v('fPhone')}\nWebsite: ${v('fWebsite')}\n\nServices:\n${[...state.services].map(x=>'• '+x).join('\n')}\n\nMain goal: ${state.goal}\n\nBudget: ${state.budget}\n\nProject details:\n${v('fMessage')}\n\nThank you.`;
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
}

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('seen');io.unobserve(e.target);}}),{threshold:.1});
document.querySelectorAll('.service,.cap-grid article,.process-grid article,.contact-card').forEach(x=>io.observe(x));
