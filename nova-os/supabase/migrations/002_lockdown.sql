-- Server-side service role performs Nova OS writes/reads.
-- Browser clients authenticate with Supabase Auth but do not receive the service role key.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' and tablename in (
    'organizations','agents','goals','projects','tasks','task_dependencies','approvals','events','agent_runs','memory','integrations','audit_logs','system_health','system_controls'
  ) loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
