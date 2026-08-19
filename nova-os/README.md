# NovaSpark AI Business Operating System

This directory adds the first production foundation to the existing NovaSpark Creative Ltd website without replacing the existing site.

## Phase 1 included
- Persistent CEO command center UI
- Natural-language CEO command endpoint
- Goal → plan → task execution model
- Agent registry and permissions model
- Approval gates and emergency stop state
- Audit/event model
- Supabase/Postgres migration for durable state
- Environment-driven integration status

## Required production environment
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY` (server-side only)
- `NOVA_OWNER_EMAIL` (owner identity for initial access policy)
- `NOVA_AI_MODEL` (optional; defaults to `gpt-5.6-luna`)

Never put service-role or OpenAI keys in browser code.

## Deployment
The existing site remains intact. The command center is available at `/nova-os/` and the CEO API is a Netlify Function at `/.netlify/functions/ceo`.

Run the SQL migration in Supabase before enabling production persistence. Until credentials are configured, the UI explicitly reports `NOT CONNECTED` rather than simulating data.
