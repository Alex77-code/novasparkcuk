create type public.lead_status as enum ('NEW','QUALIFIED','CONTACTED','ENGAGED','DISQUALIFIED','CONVERTED');
create type public.opportunity_stage as enum ('NEW','QUALIFIED','CONTACTED','ENGAGED','MEETING','PROPOSAL','NEGOTIATION','WON','LOST');
create type public.activity_type as enum ('NOTE','CALL','EMAIL','MEETING','TASK','WHATSAPP','LINKEDIN','SYSTEM');

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, domain text, website text, industry text, location text, country text, employee_count integer,
  fit_score numeric(5,2), marketing_score numeric(5,2), estimated_deal_value numeric(14,2), source text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, domain)
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade, first_name text, last_name text, full_name text not null,
  title text, email text, phone text, linkedin_url text, consent_status text not null default 'UNKNOWN',
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null, contact_id uuid references public.contacts(id) on delete set null,
  status public.lead_status not null default 'NEW', score numeric(5,2), source text, qualification jsonb not null default '{}'::jsonb,
  suppression_reason text, converted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null, primary_contact_id uuid references public.contacts(id) on delete set null,
  name text not null, stage public.opportunity_stage not null default 'NEW', amount numeric(14,2), currency text not null default 'GBP',
  probability numeric(5,2), expected_close_date date, service text, source text, owner_agent_id uuid references public.agents(id) on delete set null,
  next_action text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade, contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null, opportunity_id uuid references public.opportunities(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null, type public.activity_type not null, subject text, body text,
  external_id text, occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade, version integer not null default 1,
  status text not null default 'DRAFT', amount numeric(14,2), currency text not null default 'GBP', document_url text,
  terms jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(opportunity_id, version)
);
create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, channel text not null, status text not null default 'DRAFT', daily_limit integer not null default 25,
  objective text, audience jsonb not null default '{}'::jsonb, offer jsonb not null default '{}'::jsonb,
  compliance jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  email text, phone text, domain text, reason text not null, source text, created_at timestamptz not null default now()
);
create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null, source text, channel text, agent_id uuid references public.agents(id) on delete set null,
  amount numeric(14,2) not null, currency text not null default 'GBP', event_type text not null, occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_leads_score on public.leads(organization_id, status, score desc);
create index if not exists idx_opportunities_pipeline on public.opportunities(organization_id, stage, expected_close_date);
create index if not exists idx_activities_recent on public.activities(organization_id, occurred_at desc);
create index if not exists idx_revenue_events on public.revenue_events(organization_id, occurred_at desc);
create index if not exists idx_suppression_email on public.suppression_list(organization_id, email);

do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='public' and tablename in ('companies','contacts','leads','opportunities','activities','proposals','outreach_campaigns','suppression_list','revenue_events') loop execute format('alter table public.%I enable row level security',r.tablename); end loop; end $$;
