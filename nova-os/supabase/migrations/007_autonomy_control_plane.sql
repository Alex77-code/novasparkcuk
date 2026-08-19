create table if not exists public.autonomy_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  prospecting_enabled boolean not null default true,
  followups_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  outbound_requires_owner_approval boolean not null default true,
  max_new_prospects_per_run integer not null default 20,
  max_followups_per_run integer not null default 20,
  min_followup_hours integer not null default 48,
  updated_at timestamptz not null default now()
);

insert into public.autonomy_policies (organization_id)
select id from public.organizations where name = 'NovaSpark Creative'
on conflict (organization_id) do nothing;

create table if not exists public.communication_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  channel text not null default 'EMAIL',
  direction text not null default 'OUTBOUND',
  subject text,
  body text not null,
  status text not null default 'AWAITING_APPROVAL',
  scheduled_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_communication_queue_ready on public.communication_queue(organization_id,status,scheduled_at);
create index if not exists idx_communication_queue_lead on public.communication_queue(lead_id,created_at desc);

create table if not exists public.inbound_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  email text,
  company text,
  website text,
  service_interest text,
  message text,
  source text not null default 'WEBSITE',
  status text not null default 'NEW',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_leads_new on public.inbound_leads(organization_id,status,created_at desc);

alter table public.autonomy_policies enable row level security;
alter table public.communication_queue enable row level security;
alter table public.inbound_leads enable row level security;
