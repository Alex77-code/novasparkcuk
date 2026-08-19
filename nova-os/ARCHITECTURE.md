# NovaSpark AI Business Operating System

## Mission
NovaSpark AI-BOS is the operating system for NovaSpark Creative Ltd. It turns founder goals expressed in natural language into measurable business plans, agent tasks, controlled execution, and honest reporting.

## Core loop
Founder command -> NOVA CEO -> Goal Engine -> Strategy -> Task Graph -> Specialist Agents -> Tool/Integration Layer -> Results -> Analytics -> Forecast -> CEO report -> Optimization.

## Executive layer
- NOVA CEO: orchestration, goals, prioritization, approvals and business decisions.
- NOVA COO: operations and execution.
- NOVA CMO: marketing and growth.
- NOVA CRO: sales and revenue.
- NOVA CFO: finance and profitability.
- NOVA CTO: platform and integrations.
- NOVA CISO: security, permissions and auditability.

## Specialist layer
Prospecting, lead generation, sales, outreach, CRM, SEO, content, social, ads, email, creative, web/CRO, research, analytics, onboarding, delivery, retention, upsell, finance, operations, automation, QA and security.

## Revenue pipeline
Market/ICP -> Prospects -> Qualified leads -> Outreach -> Replies -> Meetings -> Proposals -> Deals -> Confirmed payments -> Onboarding -> Delivery -> Retention -> Upsell/referral.

## Safety model
Low-risk operational work can execute automatically. Medium/high-impact actions require configurable approval thresholds. Advertising spend, refunds, contracts, financial transactions, sensitive communications and destructive production changes are never silently authorized. Emergency stop halts outbound and spending workflows.

## Truth model
The system must never claim a campaign was launched, a message was sent, a lead was found, a payment was received, or revenue was generated unless a connected source confirms it. Test data must be explicitly labelled.

## Runtime architecture
Frontend -> authenticated API -> CEO orchestrator -> workflow/task engine -> agent runtime -> integration adapters -> database/analytics. Scheduled and event-driven jobs run independently of the browser. All important actions produce audit records and measurable outcomes.

## Integration status
External services are represented as explicit CONNECTED / NOT_CONNECTED / ACTION_REQUIRED states. Missing credentials never block unrelated development and are never simulated.

## Current foundation
The existing `nova-os` application already contains owner authentication, Supabase configuration checks, CEO command submission, state loading and emergency-stop UI. This branch extends that foundation rather than replacing it.
