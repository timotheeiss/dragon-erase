import { createHash, randomUUID } from "node:crypto";
import { policies, subjects } from "../fixtures";
import {
  platforms,
  type Action,
  type ActionProposal,
  type AppState,
  type AuditEvent,
  type ErasureCase,
  type Finding,
} from "../types";
import { classify, scriptedProposals, type Classifier } from "./classifier";
import { messageSearchTerms, proposedRedactionSpans } from "../message-search";
import { connectors, contentHash } from "./connectors";
import type { Store } from "./store";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
const now = () => new Date().toISOString();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function calendarMonthDeadline(received: Date) {
  const deadline = new Date(received);
  const day = deadline.getUTCDate();
  deadline.setUTCDate(1);
  deadline.setUTCMonth(deadline.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth() + 1, 0),
  ).getUTCDate();
  deadline.setUTCDate(Math.min(day, lastDay));
  return deadline.toISOString();
}

function audit(
  c: ErasureCase,
  actor: AuditEvent["actor"],
  event: string,
  message: string,
  recordId?: string,
  detail?: Record<string, unknown>,
) {
  c.audit.push({
    id: randomUUID(),
    timestamp: now(),
    actor,
    event,
    message,
    ...(recordId ? { recordId } : {}),
    ...(detail ? { detail } : {}),
  });
}

function requireCase(
  store: Store,
  id: string,
  stages?: ErasureCase["stage"][],
) {
  const c = store.getCase(id);
  if (!c)
    throw new WorkflowError("Case not found. It may have been reset.", 404);
  if (stages && !stages.includes(c.stage))
    throw new WorkflowError(
      `This action is not available during ${c.stage}. Refresh to see the current case.`,
    );
  return c;
}

export function getState(store: Store): AppState {
  const records = store.listRecords();
  return {
    activeCase: store.activeCase(),
    fixtureUpdateAvailable: records.some(
      (record) => record.id === "slack-intro",
    ),
    policies,
    sources: platforms.map((platform) => ({
      platform,
      total: records.filter((r) => r.platform === platform).length,
      active: records.filter((r) => r.platform === platform && !r.deleted)
        .length,
      protected: records.filter((r) => r.platform === platform && r.policyId)
        .length,
    })),
    aiConfigured:
      Boolean(process.env.OPENAI_API_KEY) &&
      process.env.DEMO_SCRIPTED !== "true",
  };
}

export function createCase(store: Store, query: string) {
  if (store.activeCase())
    throw new WorkflowError("Reset the demo before starting another case.");
  const search = query.trim().toLowerCase();
  if (search.length < 2 || search.length > 200)
    throw new WorkflowError(
      "Enter a customer name or email (2–200 characters).",
      400,
    );
  const candidates = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(search) ||
      subject.identifiers.some((item) => item.value.toLowerCase() === search),
  );
  if (!candidates.length)
    throw new WorkflowError(
      "No seeded customer matches that name or email. Try alex.morgan@example.com or Alex Morgan.",
      404,
    );
  const receivedAt = now();
  const c: ErasureCase = {
    id: randomUUID(),
    revision: 0,
    reference: `DR-${new Date().getUTCFullYear()}-001`,
    query: query.trim(),
    receivedAt,
    deadline: calendarMonthDeadline(new Date(receivedAt)),
    stage: "identify",
    candidates,
    subject: null,
    identityAttestedAt: null,
    findings: [],
    proposals: [],
    planVersion: 0,
    approval: null,
    results: [],
    verification: null,
    classification: null,
    failureInjected: false,
    audit: [],
  };
  audit(
    c,
    "human",
    "request.received",
    "An operator opened a synthetic erasure request.",
    undefined,
    { candidateCount: candidates.length, deadline: c.deadline },
  );
  store.insertCase(c);
  return c;
}

export function confirmIdentity(
  store: Store,
  id: string,
  subjectId: string,
  attested: boolean,
) {
  const c = requireCase(store, id, ["identify"]);
  const subject = c.candidates.find((item) => item.id === subjectId);
  if (!subject || !attested)
    throw new WorkflowError(
      "Select a candidate and confirm the simulated identity check.",
      400,
    );
  c.subject = subject;
  c.identityAttestedAt = now();
  c.stage = "discover";
  audit(
    c,
    "human",
    "identity.confirmed",
    "The operator confirmed a customer and attested the simulated identity check.",
    undefined,
    { subjectId, identifiers: subject.identifiers.length, simulated: true },
  );
  store.saveCase(c);
  return c;
}

export function discoverCase(store: Store, id: string) {
  const c = requireCase(store, id, ["discover"]);
  c.findings = connectors(store).flatMap((connector) => {
    const findings = connector.discover(c.subject!);
    audit(
      c,
      "connector",
      "connector.discover",
      connector.platform === "slack"
        ? `Searched employee message contents; found ${findings.length} Slack candidates, including ${findings.filter((f) => f.contextTerms?.length).length} contextual matches for human review.`
        : `Searched ${connector.platform}; found ${findings.length} matching records.`,
      undefined,
      {
        platform: connector.platform,
        matches: findings.length,
        simulated: true,
        ...(connector.platform === "slack"
          ? {
              searchScope: "message contents",
              contextSearchTerms: messageSearchTerms(c.subject!),
              exactIdentifierCount: c.subject!.identifiers.length,
            }
          : {}),
      },
    );
    return findings;
  });
  c.stage = "classify";
  store.saveCase(c);
  return c;
}

export async function classifyCase(
  store: Store,
  id: string,
  classifier: Classifier = classify,
) {
  const c = requireCase(store, id, ["classify"]);
  const protectedFindings = c.findings.filter((f) => f.record.policyId);
  // Protected records are decided by policy before AI sees the work queue.
  const editableFindings = c.findings.filter((f) => !f.record.policyId);
  const response = await classifier(editableFindings, c.subject!);
  c.proposals = [
    ...response.proposals,
    ...scriptedProposals(protectedFindings, c.subject!),
  ];
  c.classification = response.meta;
  c.planVersion += 1;
  c.stage = "review";
  c.approval = null;
  audit(
    c,
    response.meta.mode === "live" ? "ai" : "workflow",
    "classification.completed",
    response.meta.reason,
    undefined,
    {
      mode: response.meta.mode,
      model: response.meta.model,
      proposalCount: c.proposals.length,
    },
  );
  for (const proposal of c.proposals)
    audit(
      c,
      proposal.origin === "policy"
        ? "policy"
        : response.meta.mode === "live"
          ? "ai"
          : "workflow",
      "action.proposed",
      proposal.rationale,
      proposal.findingId,
      {
        action: proposal.action,
        policyId: proposal.policyId,
        needsReview: proposal.needsReview,
        origin: proposal.origin,
        spanCount: proposal.spans.length,
        matchMethod: c.findings.find((f) => f.id === proposal.findingId)
          ?.contextTerms?.length
          ? "context candidate"
          : "identifier",
      },
    );
  store.saveCase(c);
  return c;
}

function validatePolicy(
  c: ErasureCase,
  proposal: ActionProposal,
  finding: Finding,
) {
  if (
    finding.record.policyId &&
    (proposal.action !== "retain" ||
      proposal.policyId !== finding.record.policyId)
  )
    throw new WorkflowError(
      "Protected records cannot be changed or dismissed.",
    );
  if (
    finding.record.subjectId &&
    finding.record.subjectId !== c.subject!.id &&
    proposal.action !== "dismiss"
  )
    throw new WorkflowError(
      "This record belongs to a different person. Dismiss it as a false positive.",
    );
  if (
    proposal.action === "retain" &&
    !finding.record.policyId &&
    !proposal.reviewerReason
  )
    throw new WorkflowError("Unprotected retention needs a human explanation.");
  if (proposal.needsReview)
    throw new WorkflowError(
      "Resolve all identity and policy questions before approving.",
    );
}

export function editProposal(
  store: Store,
  id: string,
  findingId: string,
  action: Action,
  reason: string,
) {
  const c = requireCase(store, id, ["review", "approved"]);
  const finding = c.findings.find((f) => f.id === findingId);
  const proposal = c.proposals.find((p) => p.findingId === findingId);
  if (!finding || !proposal) throw new WorkflowError("Finding not found.", 404);
  if (
    c.results.some((r) => r.findingId === findingId && r.status === "succeeded")
  )
    throw new WorkflowError("An action already executed cannot be changed.");
  if (reason.trim().length < 8 || reason.trim().length > 1000)
    throw new WorkflowError(
      "Give a review reason between 8 and 1,000 characters.",
      400,
    );
  if (finding.record.policyId)
    throw new WorkflowError("Protected records are locked by policy.");
  const next: ActionProposal = {
    ...proposal,
    action,
    rationale: reason.trim(),
    reviewerReason: reason.trim(),
    needsReview: false,
    origin: "human",
    spans:
      action === "redact"
        ? proposedRedactionSpans(finding.record, c.subject!)
        : [],
  };
  validatePolicy(c, next, finding);
  c.proposals = c.proposals.map((item) =>
    item.findingId === findingId ? next : item,
  );
  c.planVersion += 1;
  c.approval = null;
  c.verification = null;
  c.stage = "review";
  audit(c, "human", "proposal.updated", reason.trim(), findingId, {
    previousAction: proposal.action,
    action,
    planVersion: c.planVersion,
  });
  store.saveCase(c);
  return c;
}

export function approveCase(
  store: Store,
  id: string,
  reviewer: string,
  confirmed: boolean,
  planVersion: number,
) {
  const c = requireCase(store, id, ["review", "approved"]);
  if (!confirmed || reviewer.trim().length < 2 || reviewer.length > 100)
    throw new WorkflowError(
      "Enter your reviewer name and confirm the exact plan.",
      400,
    );
  if (planVersion !== c.planVersion)
    throw new WorkflowError(
      "The plan changed. Review the current version before approving.",
    );
  if (
    c.proposals.length !== c.findings.length ||
    new Set(c.proposals.map((p) => p.findingId)).size !== c.findings.length
  )
    throw new WorkflowError("Every finding must have exactly one proposal.");
  const sourceHashes: Record<string, string> = {};
  for (const finding of c.findings) {
    const proposal = c.proposals.find((p) => p.findingId === finding.id);
    if (!proposal) throw new WorkflowError("A finding has no proposed action.");
    validatePolicy(c, proposal, finding);
    const record = store.record(finding.id);
    if (!record) throw new WorkflowError("A source record is unavailable.");
    if (
      !c.results.some(
        (r) => r.findingId === finding.id && r.status === "succeeded",
      ) &&
      contentHash(record) !== finding.sourceHash
    )
      throw new WorkflowError(
        "A source changed. Refresh the findings before approving.",
      );
    if (record.policyId && proposal.action !== "retain")
      throw new WorkflowError(
        "A source is now protected. Refresh the findings.",
      );
    sourceHashes[finding.id] = contentHash(record);
  }
  if (c.stage === "approved") return c;
  c.approval = {
    id: randomUUID(),
    reviewer: reviewer.trim(),
    timestamp: now(),
    planVersion: c.planVersion,
    planHash: hash(c.proposals),
    sourceHashes,
  };
  c.stage = "approved";
  audit(
    c,
    "human",
    "plan.approved",
    `${reviewer.trim()} approved plan version ${c.planVersion}.`,
    undefined,
    {
      approvalId: c.approval.id,
      planVersion: c.planVersion,
      planHash: c.approval.planHash,
      sourceHashes,
    },
  );
  store.saveCase(c);
  return c;
}

export function executeCase(
  store: Store,
  id: string,
  simulateFailure: boolean,
) {
  const c = requireCase(store, id, ["approved", "executed", "verified"]);
  if (
    !c.approval ||
    c.approval.planVersion !== c.planVersion ||
    c.approval.planHash !== hash(c.proposals)
  )
    throw new WorkflowError(
      "A valid human approval of this exact plan is required.",
    );
  if (c.stage === "verified" && c.verification?.complete) return c;
  const adapters = connectors(store);
  c.verification = null;
  for (const proposal of c.proposals) {
    const previous = c.results.find(
      (result) => result.findingId === proposal.findingId,
    );
    if (previous?.status === "succeeded") continue;
    const finding = c.findings.find((item) => item.id === proposal.findingId)!;
    const record = store.record(proposal.findingId);
    const stale =
      !record ||
      contentHash(record) !== c.approval.sourceHashes[proposal.findingId];
    if (stale) {
      c.results = c.results.filter(
        (result) => result.findingId !== proposal.findingId,
      );
      c.results.push({
        findingId: proposal.findingId,
        action: proposal.action,
        status: "stale",
        timestamp: now(),
        message:
          "Source changed after approval. Refresh findings and obtain new approval.",
        attempts: (previous?.attempts ?? 0) + 1,
      });
      c.stage = "review";
      c.approval = null;
      audit(
        c,
        "workflow",
        "execution.stale",
        "Execution paused because an approved source changed. Previous successful actions are preserved.",
        proposal.findingId,
      );
      store.saveCase(c);
      return c;
    }
    store.transaction(() => {
      let status: "succeeded" | "failed" = "succeeded";
      let message =
        proposal.action === "retain"
          ? "Preserved under the approved retention decision."
          : proposal.action === "dismiss"
            ? "Excluded as a reviewed false positive."
            : "Approved change applied to the simulated source.";
      try {
        validatePolicy(c, proposal, { ...finding, record });
        if (
          simulateFailure &&
          !c.failureInjected &&
          ["delete", "redact"].includes(proposal.action)
        ) {
          c.failureInjected = true;
          throw new WorkflowError(
            "Simulated connector timeout. Retry this action; successful actions will be skipped.",
          );
        }
        audit(
          c,
          "connector",
          "connector.execute",
          `Invoked ${finding.record.platform}.${proposal.action} for an approved record.`,
          proposal.findingId,
          {
            approvalId: c.approval!.id,
            action: proposal.action,
            simulated: true,
          },
        );
        adapters
          .find((adapter) => adapter.platform === finding.record.platform)!
          .execute(proposal, c.subject!);
      } catch (error) {
        status = "failed";
        message =
          error instanceof Error ? error.message : "Connector action failed.";
      }
      c.results = c.results.filter(
        (result) => result.findingId !== proposal.findingId,
      );
      c.results.push({
        findingId: proposal.findingId,
        action: proposal.action,
        status,
        timestamp: now(),
        message,
        attempts: (previous?.attempts ?? 0) + 1,
      });
      audit(
        c,
        "connector",
        `execution.${status}`,
        message,
        proposal.findingId,
        { action: proposal.action, attempt: (previous?.attempts ?? 0) + 1 },
      );
      c.stage = "executed";
      store.saveCase(c);
    });
  }
  if (c.stage === "approved") {
    c.stage = "executed";
    store.saveCase(c);
  }
  return c;
}

export function verifyCase(store: Store, id: string) {
  const c = requireCase(store, id, ["executed", "verified"]);
  if (!c.approval)
    throw new WorkflowError("Verification requires an approved execution.");
  const adapters = connectors(store);
  const residuals = adapters.flatMap((adapter) => {
    const hits = adapter.discover(c.subject!);
    audit(
      c,
      "connector",
      "connector.verify_discovery",
      `Re-searched ${adapter.platform}; ${hits.length} residual records.`,
      undefined,
      { platform: adapter.platform, residuals: hits.length },
    );
    return hits;
  });
  const verification: NonNullable<ErasureCase["verification"]> = {
    timestamp: now(),
    complete: false,
    removed: [],
    retained: [],
    dismissed: [],
    unresolved: [],
    platformsChecked: [...platforms],
  };
  for (const proposal of c.proposals) {
    const finding = c.findings.find((f) => f.id === proposal.findingId)!;
    const result = c.results.find((r) => r.findingId === proposal.findingId);
    const connector = adapters.find(
      (a) => a.platform === finding.record.platform,
    )!;
    const current = connector.read(finding.id);
    const unchangedException =
      (proposal.action !== "retain" && proposal.action !== "dismiss") ||
      (current && contentHash(current) === c.approval.sourceHashes[finding.id]);
    if (
      result?.status !== "succeeded" ||
      !connector.verify(proposal, c.subject!) ||
      !unchangedException
    ) {
      verification.unresolved.push({
        recordId: finding.id,
        reason:
          result?.status === "failed"
            ? result.message
            : "Direct verification found remaining identifiers or contextual references, changed content, or unavailable evidence.",
      });
      continue;
    }
    if (proposal.action === "retain") verification.retained.push(finding.id);
    else if (proposal.action === "dismiss")
      verification.dismissed.push(finding.id);
    else verification.removed.push(finding.id);
    audit(
      c,
      "connector",
      "record.verified",
      `Direct read verified the ${proposal.action} outcome.`,
      finding.id,
      { action: proposal.action },
    );
  }
  for (const residual of residuals) {
    if (
      ![...verification.retained, ...verification.dismissed].includes(
        residual.id,
      ) &&
      !verification.unresolved.some((item) => item.recordId === residual.id)
    )
      verification.unresolved.push({
        recordId: residual.id,
        reason:
          "Discovery found an unaccounted-for identifier or contextual message. A new reviewed proposal is required.",
      });
  }
  verification.complete = verification.unresolved.length === 0;
  c.verification = verification;
  c.stage = "verified";
  audit(
    c,
    "workflow",
    "verification.completed",
    verification.complete
      ? "Every finding is accounted for within the five simulated systems."
      : "Verification is incomplete. Unresolved findings require action.",
    undefined,
    {
      complete: verification.complete,
      removed: verification.removed.length,
      retained: verification.retained.length,
      dismissed: verification.dismissed.length,
      unresolved: verification.unresolved.length,
    },
  );
  store.saveCase(c);
  return c;
}

/** Re-open changed/residual findings without replaying actions that already succeeded. */
export function refreshFindings(store: Store, id: string) {
  const c = requireCase(store, id, ["review", "approved", "verified"]);
  const fresh = connectors(store).flatMap((adapter) =>
    adapter.discover(c.subject!),
  );
  const unresolved = new Set(
    c.verification?.unresolved.map((item) => item.recordId) ?? [],
  );
  for (const finding of fresh) {
    const previous = c.findings.find((item) => item.id === finding.id);
    if (
      !previous ||
      finding.sourceHash !== previous.sourceHash ||
      unresolved.has(finding.id)
    ) {
      c.findings = [
        ...c.findings.filter((item) => item.id !== finding.id),
        finding,
      ];
      c.proposals = [
        ...c.proposals.filter((item) => item.findingId !== finding.id),
        ...scriptedProposals([finding], c.subject!),
      ];
      c.results = c.results.filter((result) => result.findingId !== finding.id);
    }
  }
  // A vanished or inaccessible record must not be treated as successful deletion.
  for (const finding of c.findings) {
    const current = store.record(finding.id);
    if (
      !current ||
      (current.deleted &&
        !c.results.some(
          (r) => r.findingId === finding.id && r.status === "succeeded",
        ))
    ) {
      const p = c.proposals.find((p) => p.findingId === finding.id);
      if (p) p.needsReview = true;
    }
  }
  c.planVersion += 1;
  c.approval = null;
  c.verification = null;
  c.stage = "review";
  c.classification = {
    mode: "scripted",
    model: null,
    reason:
      "Changed findings were re-proposed using scripted rules. Fresh human approval is required.",
  };
  audit(
    c,
    "workflow",
    "findings.refreshed",
    "Refreshed source snapshots and invalidated approval. Successful unchanged actions remain recorded.",
    undefined,
    { planVersion: c.planVersion },
  );
  store.saveCase(c);
  return c;
}

export function exportReport(c: ErasureCase) {
  return {
    title: "Demo execution report",
    demo: true,
    status: c.verification?.complete
      ? "Completed within simulated scope"
      : "Incomplete—action required",
    caseId: c.id,
    reference: c.reference,
    receivedAt: c.receivedAt,
    deadline: c.deadline,
    subjectReference: c.subject?.id ?? null,
    scope: {
      platforms: [...platforms],
      syntheticOnly: true,
      recordCount: c.findings.length,
    },
    classification: c.classification,
    approval: c.approval,
    actions: c.proposals.map((p) => ({
      recordId: p.findingId,
      platform: c.findings.find((f) => f.id === p.findingId)?.record.platform,
      action: p.action,
      rationale: p.rationale,
      policyId: p.policyId,
      reviewerReason: p.reviewerReason,
      origin: p.origin,
      redactionCount: p.spans.length,
    })),
    results: c.results,
    verification: c.verification,
    retentionPolicies: policies.filter((p) =>
      c.proposals.some((proposal) => proposal.policyId === p.id),
    ),
    audit: c.audit,
    limitations: [
      "All sources and identities are synthetic. No external company systems were accessed.",
      "This is execution evidence within the declared demo scope, not GDPR certification.",
      "Redaction does not prove irreversible anonymization. Backups, histories, recipients and real platform permissions are not covered.",
      "Retention rules are illustrative. Production legal grounds and durations require company approval.",
    ],
  };
}
