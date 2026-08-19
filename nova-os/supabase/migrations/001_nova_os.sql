create extension if not exists pgcrypto;

create type public.agent_status as enum ('ONLINE','BUSY','IDLE','FAILED','BLOCKED','PAUSED');
create type public.task_status as enum ('PLANNED','PENDING','RUNNING','WAITING_APPROVAL','COMPLETED','FAILED','BLOCKED','CANCELLED');
create type public.risk_level as enum ('LOW','MEDIUM','HIGH');
create type public.goal_status as enum ('ACTIVE','PAUSED','COMPLETED','FAILED','CANCELLED');

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  role text not null,
  status public.agent_status not null default 'IDLE',
  permissions jsonb not null default '{}'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  objective text not null,
  target_value numeric,
  target_currency text,
  status public.goal_status not null default 'ACTIVE',
  kpis jsonb not null default '[]'::jsonb,
  strategy jsonb not null default '{}'::jsonb,
  forecast jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'PLANNED',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  title text not null,
  description text,
  status public.task_status not null default 'PLANNED',
  priority integer not null default 50,
  risk public.risk_level not null default 'LOW',
  approval_required boolean not null default false,
  deadline timestamptz,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  retries integer not null default 0,
  max_retries integer not null default 2,
  error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  risk public.risk_level not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING',
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  source text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  provider text,
  model text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  status text not null,
  duration_ms integer,
  cost numeric,
  error text,
  created_at timestamptz not null default now()
);

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

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'NOT_CONNECTED',
  scopes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_type text not null,
  actor_id text,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_health (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  component text not null,
  status text not null default 'WARNING',
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now(),
  unique (organization_id, component)
);

create table if not exists public.system_controls (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  emergency_stop boolean not null default false,
  outbound_enabled boolean not null default false,
  spending_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_queue on public.tasks (organization_id, status, priority desc, created_at);
create index if not exists idx_events_pending on public.events (organization_id, processed_at, created_at);
create index if not exists idx_audit_recent on public.audit_logs (organization_id, created_at desc);
create index if not exists idx_agent_runs_recent on public.agent_runs (organization_id, created_at desc);

insert into public.organizations (name, legal_name)
select 'NovaSpark Creative', 'NovaSpark Creative Ltd'
where not exists (select 1 from public.organizations where name = 'NovaSpark Creative');

insert into public.system_controls (organization_id)
select id from public.organizations where name = 'NovaSpark Creative'
on conflict (organization_id) do nothing;

insert into public.agents (organization_id, key, name, role, permissions, tools)
select o.id, a.key, a.name, a.role, a.permissions::jsonb, a.tools::jsonb
from public.organizations o
cross join (values
 ('ceo','NOVA CEO','Central orchestrator','{"delegate":true,"approve_low_risk":true}' , '[]'),
 ('coo','NOVA COO','Operations and execution','{"tasks":true,"workflows":true}', '[]'),
 ('cmo','NOVA CMO','Marketing strategy and growth','{"marketing":true}', '[]'),
 ('cro','NOVA CRO','Revenue and sales strategy','{"crm":true,"sales":true}', '[]'),
 ('cfo','NOVA CFO','Finance and profitability','{"finance_read":true}', '[]'),
 ('cto','NOVA CTO','Technology and infrastructure','{"tech":true}', '[]'),
 ('ciso','NOVA CISO','Security and access control','{"security":true}', '[]'),
 ('prospector','NOVA PROSPECTOR','Permitted prospect discovery','{"prospecting":true}', '[]'),
 ('leadgen','NOVA LEADGEN','Lead qualification and enrichment','{"leadgen":true}', '[]'),
 ('sales','NOVA SALES','Pipeline management','{"crm":true}', '[]'),
 ('outreach','NOVA OUTREACH','Compliant outbound workflows','{"outbound":true}', '[]'),
 ('seo','NOVA SEO','Search optimisation','{"seo":true}', '[]'),
 ('content','NOVA CONTENT','Content production','{"content":true}', '[]'),
 ('social','NOVA SOCIAL','Social publishing','{"social":true}', '[]'),
 ('ads','NOVA ADS','Paid advertising','{"ads":true}', '[]'),
 ('email','NOVA EMAIL','Email marketing','{"email":true}', '[]'),
 ('creative','NOVA CREATIVE','Creative production','{"creative":true}', '[]'),
 ('web','NOVA WEB','Website operations','{"web":true}', '[]'),
 ('cro_agent','NOVA CRO AGENT','Conversion optimisation','{"cro":true}', '[]'),
 ('research','NOVA RESEARCH','Business research','{"research":true}', '[]'),
 ('analytics','NOVA ANALYTICS','Analytics and reporting','{"analytics":true}', '[]'),
 ('client','NOVA CLIENT','Client communications','{"client":true}', '[]'),
 ('delivery','NOVA DELIVERY','Client delivery','{"delivery":true}', '[]'),
 ('retention','NOVA RETENTION','Retention and health','{"retention":true}', '[]'),
 ('upsell','NOVA UPSELL','Relevant expansion opportunities','{"upsell":true}', '[]'),
 ('finance','NOVA FINANCE','Financial operations','{"finance":true}', '[]'),
 ('ops','NOVA OPS','Operational workflows','{"ops":true}', '[]'),
 ('automation','NOVA AUTOMATION','Automation engine','{"automation":true}', '[]'),
 ('qa','NOVA QA','Quality control','{"qa":true}', '[]'),
 ('security','NOVA SECURITY','Security controls','{"security":true}', '[]')
) as a(key,name,role,permissions,tools) on conflict (organization_id,key) do nothing;

insert into public.integrations (organization_id, provider)
select o.id, p.provider
from public.organizations o
cross join (values ('OpenAI'),('Gmail'),('Google Calendar'),('Google Ads'),('Google Analytics'),('Google Search Console'),('Meta'),('Instagram'),('Facebook'),('LinkedIn'),('WhatsApp Business'),('Stripe'),('WordPress'),('Shopify'),('Canva'),('Slack')) p(provider)
on conflict (organization_id,provider) do nothing;
