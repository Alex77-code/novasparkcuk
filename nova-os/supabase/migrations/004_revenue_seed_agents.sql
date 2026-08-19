insert into public.agents (organization_id,key,name,role,permissions,tools)
select o.id,a.key,a.name,a.role,a.permissions::jsonb,a.tools::jsonb
from public.organizations o
cross join (values
 ('prospector','NOVA PROSPECTOR','Permitted prospect discovery','{"prospecting":true}','[]'),
 ('leadgen','NOVA LEADGEN','Lead qualification and scoring','{"leadgen":true}','[]'),
 ('sales','NOVA SALES','Pipeline and opportunity management','{"crm":true,"sales":true}','[]'),
 ('closer','NOVA CLOSER','Deal progression and objection handling','{"sales":true,"proposals":true}','[]'),
 ('outreach','NOVA OUTREACH','Compliant outbound execution','{"outbound":true,"suppression":true}','[]'),
 ('crm','NOVA CRM','CRM hygiene and pipeline integrity','{"crm":true}','[]')
) as a(key,name,role,permissions,tools) on conflict (organization_id,key) do update set role=excluded.role,permissions=excluded.permissions,tools=excluded.tools,updated_at=now();
