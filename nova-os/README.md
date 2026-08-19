# NovaSpark AI Business Operating System

This directory adds the NovaSpark Creative Ltd operating system to the existing website without replacing the existing site.

## Autonomous operating model
- NOVA CEO accepts natural-language owner objectives and delegates work across the agent workforce.
- Revenue engine plans around sales targets, pipeline and forecasts.
- NOVA PROSPECTOR researches legitimate UK B2B prospects from public company-level information and records evidence.
- NOVA LEADGEN scores prospects and inbound enquiries.
- NOVA OUTREACH drafts compliant outreach and queues it for owner approval before any external send.
- NOVA SALES manages opportunities, proposals and revenue events.
- NOVA DELIVERY turns won opportunities into concrete client deliverables, runs QA and creates an owner-review item.
- Inbound website enquiries are captured automatically and processed by the hourly autopilot.
- Hourly autopilot coordinates inbound qualification, prospecting and eligible contracted-project delivery.
- Emergency stop, audit logs, approvals, RLS and integration status remain part of the control plane.

## Autonomy control plane
The `autonomy_policies` table controls whether prospecting, follow-ups and delivery automation are enabled, sets safe per-run limits, and keeps outbound communications owner-approval gated by default.

The `communication_queue` records outbound work before provider delivery. The `inbound_leads` table receives website enquiries without exposing privileged database credentials to the browser.

## Phase 2 tables
- `acquisition_runs`
- `delivery_projects`
- `delivery_artifacts`
- `autonomy_runs`
- `autonomy_policies`
- `communication_queue`
- `inbound_leads`

## Core functions
- `/.netlify/functions/ceo` — natural-language owner command orchestration.
- `/.netlify/functions/acquisition` — compliant public-web prospect discovery.
- `/.netlify/functions/inbound-lead` — public website enquiry capture.
- `/.netlify/functions/delivery` — generate and QA a client delivery package.
- `/.netlify/functions/autopilot` — hourly autonomous orchestration.

## Required production environment
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY` (server-side only)
- `NOVA_OWNER_EMAIL`
- `NOVA_AI_MODEL` (optional)

Never put service-role or OpenAI keys in browser code. Never represent forecasts as guaranteed revenue. Never claim a message was sent, a payment was received, or a project was delivered unless the relevant provider reports a real result.

## Operating principle
The OS is autonomous **inside defined authority boundaries**: it can research, plan, score, draft, create tasks, qualify inbound leads, build deliverables and prepare actions without asking the owner every step. High-impact external actions such as outbound communication, spending, irreversible changes and final client release remain explicitly approval-gated unless the owner later configures a different policy.
