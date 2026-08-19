# NovaSpark Multi-Tenant Security Foundation

## Purpose
Define the ownership model required before production RLS policies are added.

## Ownership model
- `organizations` is the tenant boundary.
- Every tenant-owned operational row must carry `organization_id` (or a documented indirect ownership path).
- User access must be derived from authenticated identity and an organization-membership relation; never from a client-supplied organization id alone.
- Service-role/background workers may use server-side credentials, but must still scope queries to the intended organization.
- Cross-tenant reads/writes are forbidden.

## Required migration sequence
1. Inspect existing schema and foreign keys.
2. Add/confirm organization membership relation.
3. Backfill organization ownership for existing rows where it can be established safely.
4. Add foreign keys and indexes.
5. Add RLS policies for authenticated users and narrowly scoped service operations.
6. Run Supabase security advisors and cross-tenant negative tests.
7. Only then mark production security ready.

## Current blocker
The current database inspection did not find foreign keys containing `organization`, `user`, or `client` columns. Therefore this document intentionally does **not** create guessed policies or mutate production schema.

## Acceptance criteria
- A user can access only organizations they belong to.
- A client cannot read another client's project, task, payment, lead, or reporting data.
- Background agents cannot cross organization boundaries.
- Emergency-stop and audit data remain protected.
- Security advisor has no `rls_enabled_no_policy` findings for tenant-owned tables.
