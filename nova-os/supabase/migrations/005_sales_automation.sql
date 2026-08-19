create table if not exists public.lead_scores (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete cascade, score numeric(5,2) not null default 0,
 fit_score numeric(5,2) not null default 0, intent_score numeric(5,2) not null default 0, engagement_score numeric(5,2) not null default 0,
 reasons jsonb not null default '[]'::jsonb, model_version text not null default 'rules-v1', calculated_at timestamptz not null default now(), unique(lead_id)
);
create table if not exists public.outreach_sequences (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null, channel text not null, status text not null default 'DRAFT', max_steps integer not null default 3,
 daily_limit integer not null default 25, stop_on_reply boolean not null default true, compliance jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.outreach_steps (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.outreach_sequences(id) on delete cascade,
 step_no integer not null, delay_hours integer not null default 24, subject_template text, body_template text not null,
 requires_approval boolean not null default true, unique(sequence_id, step_no)
);
create table if not exists public.outreach_enrollments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 sequence_id uuid not null references public.outreach_sequences(id) on delete cascade, lead_id uuid not null references public.leads(id) on delete cascade,
 status text not null default 'PENDING', current_step integer not null default 0, next_run_at timestamptz,
 stopped_reason text, enrolled_at timestamptz not null default now(), unique(sequence_id, lead_id)
);
create table if not exists public.meetings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid references public.leads(id) on delete set null, opportunity_id uuid references public.opportunities(id) on delete set null,
 starts_at timestamptz, ends_at timestamptz, status text not null default 'SCHEDULED', provider text, external_id text,
 notes text, created_at timestamptz not null default now()
);
create table if not exists public.sales_forecasts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 period_start date not null, period_end date not null, target numeric(14,2) not null default 0, pipeline numeric(14,2) not null default 0,
 weighted_pipeline numeric(14,2) not null default 0, forecast numeric(14,2) not null default 0, probability numeric(5,2) not null default 0,
 assumptions jsonb not null default '{}'::jsonb, calculated_at timestamptz not null default now()
);
create index if not exists idx_lead_scores_rank on public.lead_scores(organization_id,score desc);
create index if not exists idx_enrollments_due on public.outreach_enrollments(organization_id,status,next_run_at);
create index if not exists idx_forecasts_period on public.sales_forecasts(organization_id,period_start,period_end);
do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='public' and tablename in ('lead_scores','outreach_sequences','outreach_steps','outreach_enrollments','meetings','sales_forecasts') loop execute format('alter table public.%I enable row level security',r.tablename); end loop; end $$;
