# NovaSpark AI Business Operating System

This directory adds the NovaSpark Creative Ltd operating system to the existing website without replacing the existing site.

## Autonomous operating model
- NOVA CEO accepts natural-language owner objectives.
- Revenue engine plans around sales targets and forecasts.
- NOVA PROSPECTOR researches public company-level prospects and records evidence.
- Outreach is drafted automatically but remains owner-approval gated before any external send.
- NOVA DELIVERY turns active commercial opportunities into concrete client deliverables, runs a QA gate, and creates an owner review item.
- External client delivery remains blocked until the owner approves the release.
- Hourly autopilot coordinates prospecting and eligible contracted-project delivery.
- Emergency stop, audit logs, approvals, RLS, and integration status remain part of the control plane.

## Phase 2 tables
- `acquisition_runs`
- `delivery_projects`
- `delivery_artifacts`
- `autonomy_runs`

## Phase 2 functions
- `/.netlify/functions/acquisition` — owner-triggered compliant prospect discovery.
- `/.netlify/functions/delivery` — generate and QA a client delivery package, then queue owner approval.
- `/.netlify/functions/autopilot` — hourly orchestration of acquisition and contracted-project delivery.

## Required production environment
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (server-side auth verification)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY` (server-side only)
- `NOVA_OWNER_EMAIL` (owner identity for access policy)
- `NOVA_AI_MODEL` (optional; defaults to `gpt-5.6-luna`)

Never put service-role or OpenAI keys in browser code. Do not treat AI-generated estimates as real revenue or customer commitments.

## Deployment
The existing site remains intact. The command center is available at `/nova-os/`. All autonomous external actions must pass their configured approval gates; the system must never claim a message was sent, a campaign ran, a payment was received, or a project was deployed unless the corresponding integration reports a real result.
