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

/* Premium scroll-driven layer inspired by modern UK agency interaction patterns.
   This keeps NovaSpark's existing content but adds depth, pinned-style moments,
   progressive counters, cursor glow and section-aware motion. */
const motionStyle=document.createElement('style');
motionStyle.textContent=`
  :root{--nova-sky:#69d8ff;--nova-blue:#168bd3;--nova-ice:#e9f9ff}
  body{background:#fff}
  .motion-glow{position:fixed;width:260px;height:260px;border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(circle,rgba(105,216,255,.12),rgba(22,139,211,0) 68%);transform:translate(-50%,-50%);opacity:0;transition:opacity .25s ease;mix-blend-mode:multiply}
  .hero,.section,.header,footer{position:relative}
  .hero:after,.section:after{content:'';position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(105,216,255,.28),transparent);pointer-events:none}
  .hero:after{bottom:0}.section:after{bottom:0}
  .hero-art .panel{transition:transform .18s ease-out,box-shadow .5s ease}.hero-art .panel:hover{box-shadow:0 45px 110px rgba(11,78,162,.28)}
  .orbital{transition:transform .3s ease-out}
  .service-grid,.cap-grid,.process-grid{perspective:1200px}
  .service.seen,.cap-grid article.seen,.process-grid article.seen{transform:translate3d(0,0,0) rotateX(0)}
  .service:not(.seen),.cap-grid article:not(.seen),.process-grid article:not(.seen){transform:translate3d(0,46px,0) rotateX(3deg)}
  .service:hover{transform:translateY(-10px) rotateX(0)!important}
  .service .service-symbol{transition:transform .5s cubic-bezier(.16,1,.3,1),color .3s}.service:hover .service-symbol{transform:translateY(-5px) scale(1.08) rotate(-5deg)}
  .cap-grid article h3,.process-grid article h3{transition:transform .5s}.cap-grid article:hover h3,.process-grid article:hover h3{transform:translateX(5px)}
  .scroll-scene{position:relative;min-height:125vh;display:flex;align-items:center}
  .scroll-scene .scene-inner{width:100%;position:sticky;top:12vh}
  .scene-word{font:800 clamp(55px,9vw,150px)/.82 'Manrope';letter-spacing:-.09em;color:rgba(22,139,211,.06);white-space:nowrap;position:absolute;left:-2vw;top:12%;pointer-events:none;transform:translateX(var(--scene-x,0px));transition:transform .08s linear}
  .scene-card{background:linear-gradient(145deg,#061b32,#0b4f83);border:1px solid rgba(105,216,255,.25);border-radius:26px;padding:clamp(28px,5vw,70px);color:#fff;min-height:430px;display:grid;grid-template-columns:1fr .9fr;gap:50px;align-items:center;overflow:hidden;box-shadow:0 40px 100px rgba(7,47,80,.2);transform:translateY(var(--scene-y,0px)) scale(var(--scene-scale,1));transition:box-shadow .4s}
  .scene-card h2{font-size:clamp(42px,6vw,76px);line-height:.95;letter-spacing:-.07em;margin:0 0 20px}.scene-card p{color:#c4e4f4;max-width:540px}.scene-visual{height:300px;border:1px solid rgba(255,255,255,.14);border-radius:20px;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 45%,rgba(105,216,255,.28),transparent 32%),linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.01))}.scene-visual i{position:absolute;border:1px solid rgba(105,216,255,.35);border-radius:50%;width:300px;height:120px;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-20deg)}.scene-visual i:nth-child(2){width:360px;height:180px;transform:translate(-50%,-50%) rotate(28deg)}.scene-visual b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:75px;height:75px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#0b4f83;box-shadow:0 0 55px rgba(105,216,255,.65);font-size:10px}
  .scene-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#78d9ff;font-weight:800}
  .scene-list{display:flex;flex-wrap:wrap;gap:9px;margin-top:25px}.scene-list span{padding:9px 12px;border:1px solid rgba(255,255,255,.16);border-radius:999px;font-size:10px;color:#e7f8ff;background:rgba(255,255,255,.04)}
  @media(max-width:760px){.scroll-scene{min-height:115vh}.scene-card{grid-template-columns:1fr;gap:20px;min-height:600px;padding:30px 24px}.scene-visual{height:230px}.scene-word{top:7%;font-size:70px}.motion-glow{display:none}}
  @media(prefers-reduced-motion:reduce){.motion-glow{display:none}.scene-card{transform:none!important}.scene-word{transform:none!important}}
`;
document.head.appendChild(motionStyle);

const glow=document.createElement('div');glow.className='motion-glow';document.body.appendChild(glow);
if(pointer.matches){
  addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';glow.style.opacity='.9'},{passive:true});
  addEventListener('pointerleave',()=>glow.style.opacity='0');
}

/* Add a new scroll-story section without changing the existing HTML content. */
const anchor=document.querySelector('#capabilities');
if(anchor && !document.querySelector('.nova-scroll-story')){
  const scene=document.createElement('section');
  scene.className='section scroll-scene nova-scroll-story';
  scene.setAttribute('aria-label','NovaSpark growth system');
  scene.innerHTML=`<div class="wrap scene-inner"><div class="scene-word" aria-hidden="true">GROWTH</div><div class="scene-card"><div><div class="scene-label">NovaSpark / Growth system</div><h2>Strategy that moves with your business.</h2><p>We connect visibility, demand, digital experience and automation into one progressive growth journey.</p><div class="scene-list"><span>Discover</span><span>Position</span><span>Launch</span><span>Optimise</span><span>Scale</span></div></div><div class="scene-visual" aria-hidden="true"><i></i><i></i><b>GROW</b></div></div></div></section>`;
  anchor.parentNode.insertBefore(scene,anchor);
}

const scene=document.querySelector('.nova-scroll-story');
function updateScene(){
  if(!scene||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const r=scene.getBoundingClientRect();
  const total=Math.max(scene.offsetHeight-innerHeight,1);
  const p=Math.max(0,Math.min(1,-r.top/total));
  scene.style.setProperty('--scene-y',`${(0.5-p)*24}px`);
  scene.style.setProperty('--scene-scale',(1-0.035*Math.abs(.5-p)).toFixed(4));
  const word=scene.querySelector('.scene-word');if(word)word.style.setProperty('--scene-x',`${(p-.5)*100}px`);
  const card=scene.querySelector('.scene-card');if(card)card.style.boxShadow=`0 ${35+Math.round(p*20)}px ${90+Math.round(p*35)}px rgba(7,47,80,${.16+.08*p})`;
}
addEventListener('scroll',updateScene,{passive:true});addEventListener('resize',updateScene);updateScene();

/* Section-aware navigation state */
const navSections=[...document.querySelectorAll('main section[id]')];
const navObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){document.querySelectorAll('#navlinks a').forEach(a=>a.classList.remove('active'));const a=document.querySelector(`#navlinks a[href="#${e.target.id}"]`);if(a)a.classList.add('active');}}),{rootMargin:'-35% 0px -55% 0px',threshold:0});
navSections.forEach(s=>navObserver.observe(s));

/* Magnetic hero visual */
if(pointer.matches && heroArt){heroArt.addEventListener('pointermove',e=>{const r=heroArt.getBoundingClientRect();const x=(e.clientX-r.left-r.width/2)/r.width;const y=(e.clientY-r.top-r.height/2)/r.height;const panel=heroArt.querySelector('.panel');if(panel)panel.style.transform=`translate3d(${x*12}px,${y*12}px,0)`;heroArt.querySelectorAll('.orbital').forEach((o,i)=>o.style.transform=`rotate(${i?28:-18}deg) translate(${x*(i?10:-7)}px,${y*8}px)`);});heroArt.addEventListener('pointerleave',()=>{const panel=heroArt.querySelector('.panel');if(panel)panel.style.transform='';heroArt.querySelectorAll('.orbital').forEach((o,i)=>o.style.transform=`rotate(${i?28:-18}deg)`);});}
