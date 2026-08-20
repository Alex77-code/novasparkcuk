-- NovaSpark AI-BOS core schema
-- Designed for Supabase/Postgres. Apply through Supabase migrations.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  role text not null,
  status text not null default 'IDLE',
  permissions jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  target_value numeric,
  target_currency text default 'GBP',
  target_date date,
  status text not null default 'ACTIVE',
  forecast jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  name text not null,
  status text not null default 'PLANNED',
  priority integer not null default 50,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  goal_id uuid references goals(id) on delete set null,
  agent_id uuid references agents(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'PLANNED',
  priority integer not null default 50,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  approval_required boolean not null default false,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error jsonb,
  created_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  website text,
  country text,
  industry text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  name text,
  email text,
  phone text,
  role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  source text,
  score numeric,
  status text not null default 'NEW',
  consent_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  stage text not null default 'QUALIFIED',
  value numeric,
  currency text default 'GBP',
  probability numeric,
  expected_close date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  health_status text not null default 'HEALTHY',
  services jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  external_id text,
  amount numeric not null,
  currency text not null default 'GBP',
  status text not null,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  channel text not null,
  status text not null default 'DRAFT',
  budget numeric,
  currency text default 'GBP',
  objective text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'NOT_CONNECTED',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  action_type text not null,
  risk_level text not null,
  status text not null default 'PENDING',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  status text not null default 'RUNNING',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error jsonb,
  cost numeric,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_type text not null,
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists system_controls (
  organization_id uuid primary key references organizations(id) on delete cascade,
  emergency_stop boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_org_status on tasks(organization_id, status);
create index if not exists idx_leads_org_status on leads(organization_id, status);
create index if not exists idx_opportunities_org_stage on opportunities(organization_id, stage);
create index if not exists idx_payments_org_status on payments(organization_id, status);
create index if not exists idx_agent_runs_org_status on agent_runs(organization_id, status);
create index if not exists idx_audit_logs_org_created on audit_logs(organization_id, created_at desc);
