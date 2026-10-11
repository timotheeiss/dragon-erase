# Dragon Erase

A local hackathon demo of human-approved customer erasure across five simulated systems. Real AI can propose actions; deterministic server code controls approval, execution and verification. All source data is synthetic.

## Run

Requires Node **22.13+** (uses built-in `node:sqlite`).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. The server binds to loopback; this is intentionally a single-user local demo, without authentication. SQLite persists at `.data/dragon.sqlite`. Reset restores all fixtures and clears cases and audit logs.

### Optional live AI

Copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, and restart. The default model is `gpt-5.4-mini`; override with `OPENAI_MODEL`. Never put the API key in a `NEXT_PUBLIC_` variable or commit it.

Missing keys, timeouts (25 seconds), refusal, or invalid output produce a visible **Scripted fallback**. `DEMO_SCRIPTED=true` forces a predictable offline presentation. Only synthetic customer context and unprotected findings are sent to OpenAI, with `store: false`. This is not a claim of zero provider retention. Protected records are resolved locally. No model tools are provided.

## Three-minute walkthrough

1. Start with **Alex Morgan**. Select the Northstar customer, not the Fieldwork partner, and attest the simulated identity check.
2. Discover & classify. Filter to **Slack** to inspect employee messages about the external customer. **Customer handoff discussion** mentions Alex by name and email. **Export follow-up** has neither: it references the company and the customer's export-settings problem. No customer Slack account, handle or ID is assumed.
3. Open the three **Needs review** records. For **Export follow-up**, inspect the contextual evidence and redaction preview, choose a verdict and save your reason. Dismiss the partner contact and agency workshop using their different identity evidence. Open the protected invoice to show that policy locks still apply.
4. Review & approve the exact plan. Optionally enable **Simulate connector failure**, then execute.
5. Verify. If a failure was injected, show the incomplete outcome, retry failed actions, then verify again.
6. Open the report, print/save it as PDF, or export audit JSON. Reset for the next demo.

## Architecture

- Next.js App Router, TypeScript, Tailwind, local shadcn/ui-style Button and Radix Dialog primitives, SQLite.
- `src/lib/server/workflow.ts`: deterministic state transitions and approval gates.
- `src/lib/server/connectors.ts`: five mock adapters with discover/read/execute/verify; deletes clear source content and redactions replace exact approved spans.
- `src/lib/message-search.ts`: bounded Slack message retrieval using exact identifiers or a company plus a support-history term. These are candidate searches, not an autonomous search of a real Slack workspace. Live AI reads the retrieved messages and customer context to propose whether they relate; scripted fallback supplies a clearly labeled example. Contextual matches always require human review. Redaction can remove the matching employee message body while preserving the author and unrelated replies. Verification repeats both direct and contextual searches.
- `src/lib/server/classifier.ts`: OpenAI Responses structured output, Zod validation and scripted fallback.
- Shared types and immutable seed fixtures under `src/lib`.
- Local JSON API: `/api/state`, `/api/cases`, `/api/cases/:id/actions`, `/api/cases/:id/report`, `/api/reset`.
- Human approval binds the plan version/hash and source hashes. Changed content pauses execution. Successful mutations and their audit result commit together in SQLite. Retries skip successful actions.
- Verification independently re-reads records and repeats discovery; retained matches and reviewed false positives are accounted for explicitly. Missing evidence or unresolved matches prevents completion.
- Source snapshots are preserved in the case for the synthetic demo's comparison UI. Export omits document bodies and redaction text. Explanations and reviewer notes remain in the audit; do not enter real personal data.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use local Chrome on macOS if installed, otherwise Playwright Chromium (`npx playwright install chromium`). They launch an isolated server on port 3100 with `.data/e2e.sqlite`, exercise human approval and recovery, and save desktop/mobile/print screenshots in `test-results/`.

## Deliberate limits

If an existing local database contains the earlier Slack onboarding example, **Load updated demo** opens the reset confirmation. Reset loads the revised fixtures and clears the previous synthetic case; existing case history is never silently migrated or discarded.

This is **not a production compliance system or GDPR certification**. It does not connect external accounts, verify real identities, determine legal exemptions, notify data subjects or recipients, or cover backups and version histories. Redaction is not proof of irreversible anonymization. Retention policies and dates are illustrative. The one-calendar-month deadline is a demo timer; national deadline details, holidays, exceptions and extensions need legal validation.

Do not expose this unauthenticated demo publicly or use it with real personal data. A production system needs tenant/user access controls, retention and legal review, a complete data inventory, restricted credentials, provider agreements, audit retention policy, recovery handling, recipient notices and platform-specific capability checks. Slack cannot arbitrarily edit other users' messages; Google Docs revisions cannot be individually deleted through the Drive revisions API. A zero-result search alone never proves erasure.

References: [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en), [Slack message limits](https://docs.slack.dev/messaging/modifying-messages), [Drive revisions](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/delete), [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
