# NovaSpark E2E Autonomous Company Flow

## Objective
Provide the production acceptance path for an autonomous digital-marketing company.

## Flow
1. Acquisition discovers a prospect.
2. Lead scoring qualifies the prospect.
3. Outreach creates compliant contact/follow-up work.
4. Sales opportunity is created and advanced.
5. Proposal is generated and sent.
6. Customer approval is recorded.
7. Payment is confirmed through the configured payment integration.
8. Client project is created and scoped.
9. Execution worker assigns work to the appropriate AI agent.
10. AI provider returns an output.
11. QA validates the output against acceptance criteria.
12. Approved work is delivered to the client.
13. Reporting records delivery and business KPIs.
14. Retention/follow-up creates the next customer action.
15. CEO layer evaluates revenue, delivery, risk, and next actions.

## Hard gates
- Never mark payment received without provider confirmation.
- Never mark work completed without QA acceptance.
- Never send external communication without an authorized integration and policy check.
- Never access data outside the task's organization scope.
- Emergency stop must block autonomous execution.

## Acceptance criteria
A test run must produce traceable records from prospect through delivery, with failures/retries visible in the event/audit trail.
