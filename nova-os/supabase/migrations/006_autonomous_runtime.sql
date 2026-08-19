-- Autonomous runtime extensions for NovaSpark AI-BOS
create table if not exists public.memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  importance integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category, key)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  severity text not null default 'INFO',
  title text not null,
  body text not null,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_org_importance on public.memory(organization_id, importance desc);
create index if not exists idx_notifications_org_created on public.notifications(organization_id, created_at desc);

-- Ensure runtime control fields exist on the canonical control row.
alter table public.system_controls add column if not exists outbound_enabled boolean not null default false;
alter table public.system_controls add column if not exists spending_enabled boolean not null default false;
alter table public.system_controls add column if not exists automation_enabled boolean not null default true;
alter table public.system_controls add column if not exists updated_at timestamptz not null default now();

-- Seed the complete executive/specialist workforce. Existing rows are updated in-place.
do $$
declare o record;
begin
  for o in select id from public.organizations where name = 'NovaSpark Creative' loop
    insert into public.agents (organization_id,key,name,role,permissions,tools)
    values
      (o.id,'ceo','NOVA CEO','Company orchestration and business decisions','{"planning":true,"orchestration":true,"approvals":true}'::jsonb,'["company_state","goal_planning","task_delegation","forecasting"]'::jsonb),
      (o.id,'coo','NOVA COO','Operations and execution','{"operations":true,"workflow":true}'::jsonb,'["tasks","projects","events"]'::jsonb),
      (o.id,'cmo','NOVA CMO','Marketing strategy and growth','{"marketing":true}'::jsonb,'["campaigns","analytics","content"]'::jsonb),
      (o.id,'cro','NOVA CRO','Revenue and sales strategy','{"sales":true,"revenue":true}'::jsonb,'["crm","pipeline","forecast"]'::jsonb),
      (o.id,'cfo','NOVA CFO','Finance and profitability','{"finance":true}'::jsonb,'["payments","expenses","forecast"]'::jsonb),
      (o.id,'cto','NOVA CTO','Technology and integrations','{"technology":true}'::jsonb,'["integrations","health"]'::jsonb),
      (o.id,'ciso','NOVA CISO','Security and auditability','{"security":true}'::jsonb,'["audit","permissions","health"]'::jsonb),
      (o.id,'prospector','NOVA PROSPECTOR','Permitted prospect discovery','{"prospecting":true}'::jsonb,'["prospect_sources"]'::jsonb),
      (o.id,'leadgen','NOVA LEADGEN','Lead qualification and scoring','{"leadgen":true}'::jsonb,'["lead_scoring"]'::jsonb),
      (o.id,'sales','NOVA SALES','Pipeline and opportunity management','{"crm":true,"sales":true}'::jsonb,'["crm","pipeline"]'::jsonb),
      (o.id,'closer','NOVA CLOSER','Deal progression and proposals','{"sales":true,"proposals":true}'::jsonb,'["proposals","pipeline"]'::jsonb),
      (o.id,'outreach','NOVA OUTREACH','Compliant outbound execution','{"outbound":true,"suppression":true}'::jsonb,'["suppression","outreach_queue"]'::jsonb),
      (o.id,'crm','NOVA CRM','CRM hygiene and pipeline integrity','{"crm":true}'::jsonb,'["crm"]'::jsonb),
      (o.id,'seo','NOVA SEO','Search optimization','{"seo":true}'::jsonb,'["website_analysis","search_console"]'::jsonb),
      (o.id,'content','NOVA CONTENT','Content strategy and production','{"content":true}'::jsonb,'["content_generation","content_calendar"]'::jsonb),
      (o.id,'social','NOVA SOCIAL','Social media planning','{"social":true}'::jsonb,'["content_generation","social_scheduler"]'::jsonb),
      (o.id,'ads','NOVA ADS','Paid advertising','{"ads":true,"spend":true}'::jsonb,'["google_ads","meta_ads"]'::jsonb),
      (o.id,'email','NOVA EMAIL','Email marketing','{"email":true}'::jsonb,'["email_campaigns"]'::jsonb),
      (o.id,'creative','NOVA CREATIVE','Creative production','{"creative":true}'::jsonb,'["creative_brief"]'::jsonb),
      (o.id,'web','NOVA WEB','Website and CRO','{"web":true,"cro":true}'::jsonb,'["website","analytics"]'::jsonb),
      (o.id,'research','NOVA RESEARCH','Market and competitor research','{"research":true}'::jsonb,'["research"]'::jsonb),
      (o.id,'analytics','NOVA ANALYTICS','Business analytics','{"analytics":true}'::jsonb,'["metrics","forecast"]'::jsonb),
      (o.id,'client','NOVA CLIENT','Client management','{"client":true}'::jsonb,'["crm","health"]'::jsonb),
      (o.id,'delivery','NOVA DELIVERY','Client service delivery','{"delivery":true}'::jsonb,'["tasks","reports"]'::jsonb),
      (o.id,'retention','NOVA RETENTION','Client retention','{"retention":true}'::jsonb,'["health","renewals"]'::jsonb),
      (o.id,'upsell','NOVA UPSELL','Relevant expansion opportunities','{"upsell":true}'::jsonb,'["crm","offers"]'::jsonb),
      (o.id,'finance','NOVA FINANCE','Finance operations','{"finance":true}'::jsonb,'["payments","reports"]'::jsonb),
      (o.id,'ops','NOVA OPS','Operational automation','{"operations":true}'::jsonb,'["tasks","scheduler"]'::jsonb),
      (o.id,'automation','NOVA AUTOMATION','Workflow execution','{"automation":true}'::jsonb,'["events","tasks","scheduler"]'::jsonb),
      (o.id,'qa','NOVA QA','Quality assurance','{"qa":true}'::jsonb,'["validation","audit"]'::jsonb),
      (o.id,'security','NOVA SECURITY','Security operations','{"security":true}'::jsonb,'["audit","health"]'::jsonb)
    on conflict (organization_id,key) do update set name=excluded.name,role=excluded.role,permissions=excluded.permissions,tools=excluded.tools,updated_at=now();
    insert into public.system_controls (organization_id, emergency_stop, outbound_enabled, spending_enabled, automation_enabled)
    values (o.id,false,false,false,true)
    on conflict (organization_id) do nothing;
  end loop;
end $$;
