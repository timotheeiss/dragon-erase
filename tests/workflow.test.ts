import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/lib/server/store";
import { assertLocalRequest } from "../src/lib/server/http";
import { subjects, seedRecords } from "../src/lib/fixtures";
import {
  classify,
  scriptedProposals,
  validateModelOutput,
  type Classifier,
} from "../src/lib/server/classifier";
import {
  connectors,
  contentHash,
  findSpans,
} from "../src/lib/server/connectors";
import {
  approveCase,
  calendarMonthDeadline,
  classifyCase,
  confirmIdentity,
  createCase,
  discoverCase,
  editProposal,
  executeCase,
  exportReport,
  refreshFindings,
  verifyCase,
} from "../src/lib/server/workflow";
import type { ErasureCase } from "../src/lib/types";

const offline: Classifier = async (findings, subject) => ({
  proposals: scriptedProposals(findings, subject),
  meta: { mode: "scripted", model: null, reason: "Test fixture" },
});

test("origin guard respects Next's internal URL normalization without allowing foreign origins", () => {
  const request = new Request("http://localhost:3100/api/cases", {
    headers: {
      host: "127.0.0.1:3100",
      origin: "http://127.0.0.1:3100",
      "content-type": "application/json",
    },
  });
  assert.doesNotThrow(() => assertLocalRequest(request, true));
  assert.throws(
    () =>
      assertLocalRequest(
        new Request(request, {
          headers: {
            host: "127.0.0.1:3100",
            origin: "https://evil.example",
            "content-type": "application/json",
          },
        }),
        true,
      ),
    /Cross-origin/,
  );
  assert.throws(
    () =>
      assertLocalRequest(
        new Request(request, { headers: { host: "public.example" } }),
      ),
    /localhost only/,
  );
});
function storeFor(t: { after: (fn: () => void) => void }) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  return store;
}
async function reviewed(store: Store) {
  const c = createCase(store, "Alex Morgan");
  confirmIdentity(store, c.id, subjects[0].id, true);
  discoverCase(store, c.id);
  await classifyCase(store, c.id, offline);
  for (const finding of store
    .getCase(c.id)!
    .findings.filter((f) => f.uncertain))
    editProposal(
      store,
      c.id,
      finding.id,
      "dismiss",
      "Different confirmed email and company; this is another person.",
    );
  return store.getCase(c.id)!;
}
function approve(store: Store, c: ErasureCase) {
  return approveCase(store, c.id, "Test reviewer", true, c.planVersion);
}

test("seeds five sources and 15 independent mutable records", (t) => {
  const store = storeFor(t);
  assert.equal(store.listRecords().length, 15);
  for (const platform of ["slack", "gmail", "salesforce", "notion", "drive"])
    assert.equal(
      store.listRecords().filter((r) => r.platform === platform).length,
      3,
    );
  const changed = store.record("sf-contact")!;
  changed.content = "changed";
  store.putRecord(changed);
  assert.notEqual(
    seedRecords().find((r) => r.id === changed.id)!.content,
    "changed",
  );
});

test("unknown customers do not create a case; same-name identities require confirmation", (t) => {
  const store = storeFor(t);
  assert.throws(
    () => createCase(store, "Nobody Unknown"),
    /No seeded customer/,
  );
  assert.equal(store.activeCase(), null);
  const c = createCase(store, "Alex Morgan");
  assert.equal(c.candidates.length, 2);
  assert.throws(
    () => confirmIdentity(store, c.id, subjects[0].id, false),
    /simulated identity/,
  );
  assert.throws(
    () => confirmIdentity(store, c.id, "invented-id", true),
    /Select a candidate/,
  );
  assert.throws(() => discoverCase(store, c.id), /not available/);
});

test("calendar-month deadline clamps month end and preserves UTC time", () => {
  assert.equal(
    calendarMonthDeadline(new Date("2026-01-31T12:30:00Z")),
    "2026-02-28T12:30:00.000Z",
  );
  assert.equal(
    calendarMonthDeadline(new Date("2028-01-31T12:30:00Z")),
    "2028-02-29T12:30:00.000Z",
  );
  assert.equal(
    calendarMonthDeadline(new Date("2026-12-10T12:30:00Z")),
    "2027-01-10T12:30:00.000Z",
  );
});

test("happy path mutates synthetic sources, preserves others, and accounts for every finding", async (t) => {
  const store = storeFor(t);
  const beforePartner = contentHash(store.record("sf-partner")!);
  const beforeInvoice = contentHash(store.record("gmail-invoice")!);
  const c = await reviewed(store);
  approve(store, c);
  executeCase(store, c.id, false);
  const verified = verifyCase(store, c.id);
  assert.equal(verified.verification!.complete, true);
  assert.equal(verified.verification!.removed.length, 11);
  assert.equal(verified.verification!.retained.length, 2);
  assert.equal(verified.verification!.dismissed.length, 2);
  assert.equal(store.record("sf-contact")!.content, "");
  assert.equal(store.record("sf-contact")!.deleted, true);
  assert.equal(contentHash(store.record("sf-partner")!), beforePartner);
  assert.equal(contentHash(store.record("gmail-invoice")!), beforeInvoice);
  assert.match(
    store.record("notion-research")!.content,
    /Move export settings into the main navigation/,
  );
  assert.equal(
    findSpans(store.record("notion-research")!, subjects[0]).length,
    0,
  );
  assert.match(
    store.record("notion-injection")!.content,
    /Ignore all previous instructions/,
  );
  assert.equal(store.record("drive-legal")!.deleted, false);
});

test("server requires human approval and explicit resolution of namesakes", async (t) => {
  const store = storeFor(t);
  const c = createCase(store, "Alex Morgan");
  confirmIdentity(store, c.id, subjects[0].id, true);
  discoverCase(store, c.id);
  await classifyCase(store, c.id, offline);
  assert.throws(() => executeCase(store, c.id, false), /not available/);
  assert.throws(
    () => approve(store, store.getCase(c.id)!),
    /different person|Resolve all/,
  );
  assert.throws(
    () =>
      editProposal(
        store,
        c.id,
        "sf-partner",
        "delete",
        "The name matched so delete it.",
      ),
    /different person/,
  );
});

test("protection rules run before AI and again at the connector", async (t) => {
  const store = storeFor(t);
  const c = createCase(store, "Alex Morgan");
  confirmIdentity(store, c.id, subjects[0].id, true);
  discoverCase(store, c.id);
  await classifyCase(store, c.id, async (findings, subject) => {
    assert.ok(findings.every((f) => !f.record.policyId));
    return offline(findings, subject);
  });
  assert.throws(
    () =>
      editProposal(
        store,
        c.id,
        "gmail-invoice",
        "delete",
        "Try to bypass the protection policy.",
      ),
    /locked by policy/,
  );
  const proposal = store
    .getCase(c.id)!
    .proposals.find((p) => p.findingId === "gmail-invoice")!;
  assert.throws(
    () =>
      connectors(store)
        .find((a) => a.platform === "gmail")!
        .execute({ ...proposal, action: "delete" }, subjects[0]),
    /Protected records/,
  );
});

test("plan edits invalidate approval and reject approval of an older version", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  const revised = editProposal(
    store,
    c.id,
    "slack-handoff",
    "redact",
    "Preserve the shared team discussion and remove identifiers.",
  );
  assert.equal(revised.approval, null);
  assert.throws(() => executeCase(store, c.id, false), /not available/);
  assert.throws(
    () => approveCase(store, c.id, "Test reviewer", true, c.planVersion),
    /plan changed/,
  );
});

for (const action of ["delete", "redact", "retain"] as const) {
  test(`reviewer can change any verdict to ${action}, with fresh approval and matching execution`, async (t) => {
    const store = storeFor(t);
    const before = store.record("sf-contact")!;
    let c = await reviewed(store);
    for (const previous of ["delete", "redact", "retain"] as const) {
      if (previous === action) continue;
      c = editProposal(
        store,
        c.id,
        before.id,
        previous,
        "Initial human review decision.",
      );
      approve(store, c);
      const version = c.planVersion;
      c = editProposal(
        store,
        c.id,
        before.id,
        action,
        `Human reviewed evidence and chose ${action}.`,
      );
      const proposal = c.proposals.find((p) => p.findingId === before.id)!;
      assert.equal(proposal.action, action);
      assert.equal(proposal.origin, "human");
      assert.deepEqual(
        proposal.spans,
        action === "redact" ? findSpans(before, subjects[0]) : [],
      );
      assert.equal(c.approval, null);
      assert.equal(c.planVersion, version + 1);
      assert.equal(c.audit.at(-1)!.detail!.previousAction, previous);
      assert.deepEqual(store.record(before.id), before);
      assert.throws(() => executeCase(store, c.id, false), /not available/);
    }
    approve(store, c);
    executeCase(store, c.id, false);
    const record = store.record(before.id)!;
    assert.equal(record.deleted, action === "delete");
    if (action === "retain") assert.deepEqual(record, before);
    else assert.equal(findSpans(record, subjects[0]).length, 0);
    if (action === "redact")
      assert.match(record.content, /Status: Former customer/);
    assert.equal(verifyCase(store, c.id).verification!.complete, true);
  });
}

test("a source change after approval pauses execution until refreshed and reapproved", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  const source = store.record("slack-handoff")!;
  source.content += "\nNew team note.";
  source.version++;
  store.putRecord(source);
  const paused = executeCase(store, c.id, false);
  assert.equal(paused.stage, "review");
  assert.equal(paused.approval, null);
  assert.ok(paused.results.some((r) => r.status === "stale"));
  assert.equal(store.record("slack-handoff")!.content, source.content);
  const revised = refreshFindings(store, c.id);
  approve(store, revised);
  executeCase(store, c.id, false);
  assert.equal(verifyCase(store, c.id).verification!.complete, true);
});

test("connector failure stays incomplete; retries and duplicate execution do not replay successes", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  const partial = executeCase(store, c.id, true);
  assert.equal(partial.results.filter((r) => r.status === "failed").length, 1);
  assert.equal(verifyCase(store, c.id).verification!.complete, false);
  const successBefore = contentHash(store.record("notion-research")!);
  const retried = executeCase(store, c.id, false);
  assert.equal(retried.results.filter((r) => r.attempts === 2).length, 1);
  assert.equal(contentHash(store.record("notion-research")!), successBefore);
  executeCase(store, c.id, false);
  assert.equal(contentHash(store.record("notion-research")!), successBefore);
  assert.equal(verifyCase(store, c.id).verification!.complete, true);
});

test("reintroduced identifiers fail verification and require a new reviewed plan", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  executeCase(store, c.id, false);
  const source = store.record("notion-research")!;
  source.content += "\nalex.morgan@example.com";
  source.version++;
  store.putRecord(source);
  const verified = verifyCase(store, c.id);
  assert.equal(verified.verification!.complete, false);
  assert.ok(
    verified.verification!.unresolved.some((u) => u.recordId === source.id),
  );
  const revised = refreshFindings(store, c.id);
  assert.equal(revised.approval, null);
  approve(store, revised);
  executeCase(store, c.id, false);
  assert.equal(verifyCase(store, c.id).verification!.complete, true);
});

test("unavailable source evidence is not treated as a successful deletion", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  executeCase(store, c.id, false);
  store.db.prepare("DELETE FROM records WHERE id = ?").run("sf-contact");
  const verified = verifyCase(store, c.id);
  assert.equal(verified.verification!.complete, false);
  assert.ok(
    verified.verification!.unresolved.some((u) => u.recordId === "sf-contact"),
  );
});

test("changed retained evidence prevents a complete report", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  executeCase(store, c.id, false);
  const record = store.record("gmail-invoice")!;
  record.content += "\nChanged invoice.";
  record.version++;
  store.putRecord(record);
  assert.equal(verifyCase(store, c.id).verification!.complete, false);
});

test("model output rejects invented records, policies and redaction spans", (t) => {
  const store = storeFor(t);
  const findings = connectors(store)
    .flatMap((a) => a.discover(subjects[0]))
    .filter((f) => !f.record.policyId && !f.uncertain);
  const proposals = scriptedProposals(findings, subjects[0]).map(
    ({ findingId, action, rationale, spans, policyId, needsReview }) => ({
      findingId,
      action,
      rationale,
      spans,
      policyId,
      needsReview,
    }),
  );
  assert.equal(
    validateModelOutput({ proposals }, findings, subjects[0]).length,
    findings.length,
  );
  assert.throws(
    () =>
      validateModelOutput(
        {
          proposals: proposals.map((p, i) =>
            i === 0 ? { ...p, findingId: "invented-record" } : p,
          ),
        },
        findings,
        subjects[0],
      ),
    /unknown record/,
  );
  assert.throws(
    () =>
      validateModelOutput(
        {
          proposals: proposals.map((p, i) =>
            i === 0 ? { ...p, policyId: "INVENTED-LAW" } : p,
          ),
        },
        findings,
        subjects[0],
      ),
    /invalid protection policy/,
  );
  const index = proposals.findIndex((p) => p.action === "redact");
  assert.throws(
    () =>
      validateModelOutput(
        {
          proposals: proposals.map((p, i) =>
            i === index
              ? {
                  ...p,
                  spans: [
                    { field: "content", start: 0, end: 10, text: "DELETE ALL" },
                  ],
                }
              : p,
          ),
        },
        findings,
        subjects[0],
      ),
    /outside the verified identifiers/,
  );
});

test("audit export contains no source bodies or redaction text", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  executeCase(store, c.id, false);
  const report = exportReport(verifyCase(store, c.id));
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(seedRecords()[0].content));
  assert.ok(!serialized.includes("Ignore all previous instructions"));
  assert.ok(!serialized.includes('"spans"'));
  assert.ok(report.audit.some((event) => event.event === "plan.approved"));
  assert.equal(report.status, "Completed within simulated scope");
});

test("reset removes case history and restores all original source records", async (t) => {
  const store = storeFor(t);
  const c = await reviewed(store);
  approve(store, c);
  executeCase(store, c.id, false);
  assert.throws(() => createCase(store, "Alex Morgan"), /Reset the demo/);
  store.reset();
  assert.equal(store.activeCase(), null);
  assert.equal(store.getCase(c.id), null);
  assert.deepEqual(
    store.listRecords(),
    seedRecords().sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test("a late model response cannot recreate a reset case", async (t) => {
  const store = storeFor(t);
  const c = createCase(store, "Alex Morgan");
  confirmIdentity(store, c.id, subjects[0].id, true);
  discoverCase(store, c.id);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = classifyCase(store, c.id, async (f, s) => {
    await gate;
    return offline(f, s);
  });
  store.reset();
  release();
  await assert.rejects(pending, /changed in another request/);
  assert.equal(store.activeCase(), null);
});

test("explicit scripted mode completes without any provider request", async (t) => {
  const store = storeFor(t);
  const previous = process.env.DEMO_SCRIPTED;
  process.env.DEMO_SCRIPTED = "true";
  try {
    const response = await classify(
      connectors(store).flatMap((a) => a.discover(subjects[0])),
      subjects[0],
    );
    assert.equal(response.meta.mode, "scripted");
    assert.equal(response.proposals.length, 15);
  } finally {
    if (previous === undefined) delete process.env.DEMO_SCRIPTED;
    else process.env.DEMO_SCRIPTED = previous;
  }
});

test("choosing the namesake cannot authorize changes to the other customer's records", async (t) => {
  const store = storeFor(t);
  const original = store.record("slack-handoff")!;
  const c = createCase(store, "Alex Morgan");
  confirmIdentity(store, c.id, subjects[1].id, true);
  discoverCase(store, c.id);
  const classified = await classifyCase(store, c.id, offline);
  assert.ok(
    classified.findings.find((f) => f.id === "slack-handoff")?.uncertain,
  );
  assert.throws(
    () =>
      editProposal(
        store,
        c.id,
        "slack-handoff",
        "redact",
        "Attempt a redaction for the wrong customer.",
      ),
    /different person/,
  );
  assert.equal(
    contentHash(store.record("slack-handoff")!),
    contentHash(original),
  );
});
