const WA = '447449793617';

const style = document.createElement('style');
style.textContent = `
  :root { --motion-blue:#168bd3; --motion-sky:#6bd5ff; }
  body::before{content:'';position:fixed;left:0;top:0;width:100%;height:3px;z-index:9999;transform-origin:left;transform:scaleX(var(--scroll-progress,0));background:linear-gradient(90deg,var(--motion-sky),var(--motion-blue),#b8efff);box-shadow:0 0 18px rgba(80,200,250,.45);pointer-events:none}
  .service,.cap-grid article,.process-grid article,.contact-card,.chips span,.section-top,.split,.industry-layout,.cta-box,.contact-links a{opacity:0;transform:translateY(34px) scale(.985);filter:blur(3px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1),filter .8s cubic-bezier(.16,1,.3,1)}
  .service.seen,.cap-grid article.seen,.process-grid article.seen,.contact-card.seen,.chips span.seen,.section-top.seen,.split.seen,.industry-layout.seen,.cta-box.seen,.contact-links a.seen{opacity:1;transform:none;filter:none}
  .service:nth-child(2),.cap-grid article:nth-child(2),.process-grid article:nth-child(2){transition-delay:.08s}.service:nth-child(3),.cap-grid article:nth-child(3),.process-grid article:nth-child(3){transition-delay:.16s}.service:nth-child(4),.cap-grid article:nth-child(4),.process-grid article:nth-child(4){transition-delay:.24s}
  .chips span{transition-duration:.65s}.chips span:nth-child(2n){transition-delay:.06s}.chips span:nth-child(3n){transition-delay:.12s}
  .service{will-change:transform}.service::after{content:'↗';position:absolute;right:22px;top:24px;color:#69d2fb;font-size:18px;opacity:.18;transform:translate(5px,-5px);transition:.3s}.service:hover::after{opacity:1;transform:none}
  .cap-grid article{position:relative;overflow:hidden}.cap-grid article::after{content:'';position:absolute;width:170px;height:170px;right:-90px;bottom:-90px;border-radius:50%;background:radial-gradient(circle,rgba(83,201,249,.28),transparent 68%);transition:.5s}.cap-grid article:hover::after{transform:scale(1.7)}
  .chips span:hover{transform:translateY(-4px);border-color:#76caef;box-shadow:0 15px 30px rgba(27,130,190,.1)}
  .hero-copy,.hero-art{will-change:transform}.hero-art .panel{will-change:transform}
  @keyframes novaPulse{0%,100%{transform:scale(.97);opacity:.72}50%{transform:scale(1.05);opacity:1}}
  .hero-art::before{animation:novaPulse 7s ease-in-out infinite}
  @media(prefers-reduced-motion:reduce){body::before{display:none}.service,.cap-grid article,.process-grid article,.contact-card,.chips span,.section-top,.split,.industry-layout,.cta-box,.contact-links a{opacity:1!important;transform:none!important;filter:none!important}.hero-copy,.hero-art{transform:none!important}.hero-art::before{animation:none!important}}
`;
document.head.appendChild(style);

const modal = document.getElementById('modal');
const nav = document.getElementById('navlinks');
const hamb = document.getElementById('hamb');
const steps = [...document.querySelectorAll('.step')];
const progress = document.getElementById('progress');
const stepLabel = document.getElementById('stepLabel');
const title = document.getElementById('widgetTitle');
const sub = document.getElementById('widgetSub');
const next = document.getElementById('next');
const back = document.getElementById('back');
const error = document.getElementById('error');
const summary = document.getElementById('summary');
let current = 1;
const state = { services:new Set(), goal:'', budget:'' };

function openModal(service=''){
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  current=1;
  if(service){const b=[...document.querySelectorAll('#servicesOptions button')].find(x=>x.dataset.v===service);if(b){state.services.add(service);b.classList.add('selected');}}
  update();
}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';}
document.querySelectorAll('.open-widget').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.service||'')));
document.querySelectorAll('[data-service]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.service)));
document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closeModal));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))closeModal();});
if(hamb){hamb.addEventListener('click',()=>{const open=nav.classList.toggle('open');hamb.setAttribute('aria-expanded',String(open));});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));}

function wireMulti(id,key){document.querySelectorAll(`#${id} button`).forEach(b=>b.addEventListener('click',()=>{if(state[key].has(b.dataset.v)){state[key].delete(b.dataset.v);b.classList.remove('selected')}else{state[key].add(b.dataset.v);b.classList.add('selected')}error.textContent='';}));}
function wireSingle(id,key){document.querySelectorAll(`#${id} button`).forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll(`#${id} button`).forEach(x=>x.classList.remove('selected'));state[key]=b.dataset.v;b.classList.add('selected');error.textContent='';}));}
wireMulti('servicesOptions','services');wireSingle('goalOptions','goal');wireSingle('budgetOptions','budget');

function update(){
  steps.forEach(s=>s.classList.toggle('active',Number(s.dataset.step)===current));
  progress.style.width=`${current*20}%`;
  stepLabel.textContent=`STEP ${current} OF 5`;
  const meta=[['What can we help you with?','Select one or more services.'],['What is your main goal?','Choose the outcome that matters most.'],['Tell us about your business','A few details help us make the conversation useful.'],['What level of investment are you considering?','Choose the closest project budget.'],['Your enquiry is ready','Review your details before opening WhatsApp.']][current-1];
  title.textContent=meta[0];sub.textContent=meta[1];back.style.visibility=current===1?'hidden':'visible';next.textContent=current===5?'Continue to WhatsApp →':'Continue →';error.textContent='';
  if(current===5)updateSummary();
}
function updateSummary(){
  const val=id=>document.getElementById(id)?.value.trim()||'Not provided';
  summary.innerHTML=`<b>Enquiry summary</b><div class="summary-grid"><span>Services</span><strong>${[...state.services].join(', ')||'Not selected'}</strong><span>Main goal</span><strong>${state.goal||'Not selected'}</strong><span>Name</span><strong>${val('fName')}</strong><span>Business</span><strong>${val('fBusiness')}</strong><span>Email</span><strong>${val('fEmail')}</strong><span>Phone</span><strong>${val('fPhone')}</strong><span>Budget</span><strong>${state.budget||'Not selected'}</strong></div>`;
}
function validStep(){
  if(current===1&&!state.services.size){error.textContent='Please select at least one service.';return false;}
  if(current===2&&!state.goal){error.textContent='Please select your main goal.';return false;}
  if(current===3){for(const id of ['fName','fBusiness','fEmail','fPhone']){const el=document.getElementById(id);if(!el.value.trim()){error.textContent='Please complete the required fields.';el.focus();return false;}}const email=document.getElementById('fEmail');if(!email.checkValidity()){error.textContent='Please enter a valid email address.';email.focus();return false;}}
  if(current===4&&!state.budget){error.textContent='Please select a budget range.';return false;}
  return true;
}
next.addEventListener('click',()=>{if(!validStep())return;if(current<5){current++;update();}else sendWhatsApp();});
back.addEventListener('click',()=>{if(current>1){current--;update();}});
function sendWhatsApp(){
  const v=id=>document.getElementById(id)?.value.trim()||'Not provided';
  const text=`Hello NovaSpark Creative Ltd,\n\nI'd like to discuss a digital marketing project.\n\nName: ${v('fName')}\nBusiness: ${v('fBusiness')}\nEmail: ${v('fEmail')}\nPhone / WhatsApp: ${v('fPhone')}\nWebsite: ${v('fWebsite')}\n\nServices:\n${[...state.services].map(x=>'• '+x).join('\n')}\n\nMain goal: ${state.goal}\n\nBudget: ${state.budget}\n\nProject details:\n${v('fMessage')}\n\nThank you.`;
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
}

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('seen');io.unobserve(e.target);}}),{threshold:.12,rootMargin:'0px 0px -70px 0px'});
document.querySelectorAll('.service,.cap-grid article,.process-grid article,.contact-card,.chips span,.section-top,.split,.industry-layout,.cta-box,.contact-links a').forEach(x=>io.observe(x));

function scrollEffects(){
  const max=document.documentElement.scrollHeight-innerHeight;
  document.body.style.setProperty('--scroll-progress',max>0?scrollY/max:0);
}
addEventListener('scroll',scrollEffects,{passive:true});scrollEffects();

const heroCopy=document.querySelector('.hero-copy');
const heroArt=document.querySelector('.hero-art');
addEventListener('scroll',()=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const y=Math.min(scrollY,650);
  if(heroCopy)heroCopy.style.transform=`translate3d(0,${y*.055}px,0)`;
  if(heroArt)heroArt.style.transform=`translate3d(0,${y*-.035}px,0)`;
},{passive:true});

const pointer=matchMedia('(pointer:fine)');
if(pointer.matches){
  document.querySelectorAll('.btn,.navcta,.project-float,.wa-float').forEach(el=>{
    el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();const x=(e.clientX-r.left-r.width/2)*.08;const y=(e.clientY-r.top-r.height/2)*.08;el.style.transform=`translate(${x}px,${y}px)`;});
    el.addEventListener('pointerleave',()=>{el.style.transform='';});
  });
}
