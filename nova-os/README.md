# NovaSpark AI Business Operating System

This directory adds the NovaSpark Creative Ltd operating system to the existing website without replacing the existing site.

## Autonomous operating model
- NOVA CEO accepts natural-language owner objectives and converts them into measurable execution plans.
- Revenue engine plans around sales targets, pipeline and forecasts.
- NOVA PROSPECTOR researches legitimate UK B2B prospects from public company-level information and records evidence.
- NOVA LEADGEN scores prospects and inbound enquiries.
- NOVA OUTREACH drafts compliant outreach and queues it for owner approval before any external send.
- NOVA SALES manages opportunities, proposals and revenue events.
- NOVA DELIVERY turns won opportunities into concrete client deliverables, runs QA and creates an owner-review item.
- Inbound website enquiries are captured automatically and processed by the hourly autopilot.
- The CEO execution engine continuously recalculates actual revenue, pipeline, weighted pipeline, qualified leads and delivery workload against active goals.
- Hourly autopilot dispatches registered task adapters, preserves blocked tasks rather than fabricating completion, and records execution runs and KPI snapshots.
- Emergency stop, audit logs, approvals, RLS and integration status remain part of the control plane.

## CEO goal loop
Owner command → goal record → AI/fallback strategy → execution plan → prioritized agent tasks → hourly dispatch → KPI snapshot → risk assessment → next cycle.

For example, an owner can issue: `NOVA, mujhe agle mahine £5,000 sales chahiye.` The system stores the target, creates acquisition/qualification/outreach/sales/delivery/forecast tasks, and measures actual revenue and weighted pipeline against the target. A target is never represented as guaranteed revenue.

## Autonomy control plane
The `autonomy_policies` table controls whether prospecting, follow-ups and delivery automation are enabled, sets safe per-run limits, and keeps outbound communications owner-approval gated by default.

The `communication_queue` records outbound work before provider delivery. The `inbound_leads` table receives website enquiries without exposing privileged database credentials to the browser.

## CEO execution tables
- `ceo_goals`
- `ceo_execution_plans`
- `ceo_tasks`
- `ceo_execution_runs`
- `ceo_kpi_snapshots`

## Core functions
- `/.netlify/functions/ceo-goal` — create a measurable CEO goal and execution plan from natural language.
- `/.netlify/functions/ceo-autopilot` — continuously execute registered adapters and update goal KPIs.
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
- `NOVA_AUTOPILOT_SECRET` (recommended for scheduled invocation)

Never put service-role or OpenAI keys in browser code. Never represent forecasts as guaranteed revenue. Never claim a message was sent, a payment was received, or a project was delivered unless the relevant provider reports a real result.

## Operating principle
The OS is autonomous **inside defined authority boundaries**: it can research, plan, score, draft, create tasks, qualify inbound leads, build deliverables and prepare actions without asking the owner every step. High-impact external actions such as outbound communication, spending, irreversible changes and final client release remain explicitly approval-gated unless the owner later configures a different policy.
