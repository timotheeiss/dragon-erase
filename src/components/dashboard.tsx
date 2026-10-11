"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  Database,
  Eraser,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  FolderLock,
  GitBranch,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  ShieldEllipsis,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceIcon } from "@/components/source-icon";
import {
  platformNames,
  type Action,
  type AppState,
  type Finding,
  type Platform,
  type RedactionSpan,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { findSpans } from "@/lib/redaction";

const steps = [
  "Request",
  "Identify",
  "Discover",
  "Classify",
  "Review",
  "Execute",
  "Verify",
  "Certificate",
];
const stageIndex = {
  identify: 1,
  discover: 2,
  classify: 3,
  review: 4,
  approved: 5,
  executed: 6,
  verified: 7,
};
const actionLabels: Record<Action, string> = {
  delete: "Delete",
  redact: "Redact",
  retain: "Retain",
  dismiss: "Dismissed",
};
const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const formatTime = (date: string) =>
  new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={cn("brand-mark", small && "brand-small")}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="m9 7 12 1 5 7-9 10-10-2-3-9 7 2 5-6-7-3Z"
          fill="currentColor"
        />
        <path d="m17 17 5-6 2 3-6 7-5-1 4-3Z" fill="#F6F4EF" />
        <path d="m10 23-5 4 8-1" fill="currentColor" />
      </svg>
    </span>
  );
}

function ActionBadge({
  action,
  needsReview = false,
}: {
  action?: Action;
  needsReview?: boolean;
}) {
  if (needsReview)
    return (
      <span className="badge badge-review">
        <CircleHelp size={12} /> Needs review
      </span>
    );
  if (!action)
    return <span className="badge badge-neutral">Awaiting proposal</span>;
  const Icon =
    action === "delete"
      ? Trash2
      : action === "redact"
        ? Eraser
        : action === "retain"
          ? LockKeyhole
          : Check;
  return (
    <span className={`badge badge-${action}`}>
      <Icon size={12} /> {actionLabels[action]}
    </span>
  );
}

function Highlight({
  text,
  spans,
  after = false,
}: {
  text: string;
  spans: RedactionSpan[];
  after?: boolean;
}) {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of ordered) {
    parts.push(text.slice(cursor, span.start));
    parts.push(
      <mark
        className={after ? "redaction-after" : "redaction-before"}
        key={`${span.start}-${span.end}`}
      >
        {after ? "[redacted]" : text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function Dashboard() {
  const [data, setData] = useState<AppState | null>(null);
  const [query, setQuery] = useState("Alex Morgan");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [attested, setAttested] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<Platform | "all">("all");
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [modal, setModal] = useState<
    "approve" | "reset" | "policies" | "sources" | "about" | null
  >(null);
  const [reviewer, setReviewer] = useState("Demo reviewer");
  const [approvedCheck, setApprovedCheck] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [editAction, setEditAction] = useState<Action>("redact");
  const [editReason, setEditReason] = useState("");

  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        const state = await response.json();
        if (!response.ok) throw new Error(state.error);
        setData(state);
      })
      .catch((err) => setError(err.message || "Unable to load the demo."));
  }, []);

  const c = data?.activeCase;
  const finding = c?.findings.find((f) => f.id === selectedFinding);
  const proposal = c?.proposals.find((p) => p.findingId === selectedFinding);
  const needsReview = c?.proposals.filter((p) => p.needsReview).length ?? 0;
  const failed =
    c?.results.filter((result) => result.status === "failed").length ?? 0;
  const completedIds = new Set(
    c?.results.filter((r) => r.status === "succeeded").map((r) => r.findingId),
  );
  const canReview = Boolean(
    finding &&
    !finding.record.policyId &&
    c &&
    ["review", "approved"].includes(c.stage) &&
    !completedIds.has(finding.id),
  );
  const previewAction = canReview ? editAction : proposal?.action;
  const hasReviewChanges =
    canReview &&
    (editAction !== proposal?.action || editReason.trim().length > 0);
  const previewSpans =
    hasReviewChanges && finding && c?.subject
      ? editAction === "redact"
        ? findSpans(finding.record, c.subject)
        : []
      : (proposal?.spans ?? []);
  const visibleFindings =
    c?.findings.filter((f) => {
      const p = c.proposals.find((p) => p.findingId === f.id);
      return (
        (sourceFilter === "all" || f.record.platform === sourceFilter) &&
        (filter === "all" ||
          (filter === "review"
            ? p?.needsReview
            : p?.action === filter && !p.needsReview))
      );
    }) ?? [];

  async function mutate(path: string, body: unknown, label: string) {
    setBusy(label);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The operation failed.");
      setData(result);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The operation failed.");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function command(body: Record<string, unknown>, label: string) {
    if (!c) return false;
    return mutate(`/api/cases/${c.id}/actions`, body, label);
  }
  async function discover() {
    if (await command({ type: "discover" }, "Searching five systems…"))
      await command({ type: "classify" }, "Preparing action proposals…");
  }
  function openFinding(f: Finding) {
    const p = c?.proposals.find((p) => p.findingId === f.id);
    setSelectedFinding(f.id);
    setEditAction(f.uncertain ? "dismiss" : (p?.action ?? "redact"));
    setEditReason("");
    setError("");
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (
      await command(
        {
          type: "edit",
          findingId: selectedFinding,
          action: editAction,
          reason: editReason,
        },
        "Saving your decision…",
      )
    )
      setSelectedFinding(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <BrandMark />
          <span>
            dragon<span className="brand-light">erase</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">N</span>
          <div>
            <strong>Northstar workspace</strong>
            <span>Demo organization</span>
          </div>
          <MoreHorizontal size={17} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={cn("nav-item", !showAudit && "active")}
            onClick={() => {
              setShowAudit(false);
              setModal(null);
            }}
          >
            <LayoutDashboard size={18} /> Requests{" "}
            <span className="nav-count">{c ? 1 : 0}</span>
          </button>
          <button className="nav-item" onClick={() => setModal("sources")}>
            <Database size={18} /> Data sources{" "}
            <span className="nav-count muted">5</span>
          </button>
          <button className="nav-item" onClick={() => setModal("policies")}>
            <FolderLock size={18} /> Protection rules{" "}
            <span className="nav-dot" />
          </button>
          <button
            className={cn("nav-item", showAudit && "active")}
            onClick={() => {
              setShowAudit(true);
              setTimeout(
                () =>
                  document
                    .getElementById("audit-trail")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50,
              );
            }}
          >
            <Activity size={18} /> Audit trail
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="guardrail-card">
            <ShieldCheck size={21} />
            <strong>You're in control.</strong>
            <p>
              AI proposes. You approve.
              <br />
              Every action leaves a trail.
            </p>
            <span>
              <span className="status-dot" /> Human approval enforced
            </span>
          </div>
          <button
            className="nav-item help-link"
            onClick={() => setModal("about")}
          >
            <BookOpen size={17} /> About this demo <ArrowUpRight size={14} />
          </button>
          <div className="user-profile">
            <span className="user-avatar">DR</span>
            <div>
              <strong>Demo reviewer</strong>
              <span>Workspace admin</span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>Erasure requests</strong>
            {c && (
              <>
                <ChevronRight size={13} />
                <span>{c.reference}</span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="demo-pill">
              <FlaskConical size={13} /> Demo workspace
            </span>
            <span className="topbar-separator" />
            <button
              className="avatar-button"
              onClick={() => setModal("about")}
              aria-label="Demo reviewer details"
            >
              DR
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading-state">
              <LoaderCircle className="spin" size={28} />
              <h2>Preparing your workspace</h2>
              <p>Loading the five simulated systems.</p>
              {error && (
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </Button>
              )}
            </div>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-square" /> PRIVACY OPERATIONS
                  </div>
                  <h1>
                    {c
                      ? "One request. Every trace."
                      : "A clean slate. A clear record."}
                  </h1>
                  <p>
                    {c
                      ? "A complete view of this request, from first match to final evidence."
                      : "Find personal data, review every decision, and erase with confidence."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setModal("reset")}
                  disabled={!!busy || !c}
                >
                  <RotateCcw size={15} /> Reset demo
                </Button>
              </section>

              <div className="pipeline" aria-label="Erasure pipeline">
                {steps.map((step, index) => {
                  const current = c ? stageIndex[c.stage] : 0;
                  return (
                    <div
                      key={step}
                      className={cn(
                        "pipeline-step",
                        index < current && "done",
                        index === current && "current",
                      )}
                      aria-current={index === current ? "step" : undefined}
                    >
                      <span className="step-number">
                        {index < current ? (
                          <Check size={13} strokeWidth={2.5} />
                        ) : (
                          String(index + 1).padStart(2, "0")
                        )}
                      </span>
                      <span>{step}</span>
                      {index !== steps.length - 1 && (
                        <span className="step-connector" />
                      )}
                    </div>
                  );
                })}
              </div>

              {!c ? (
                <>
                  <div className="intro-layout">
                    <section className="request-card panel">
                      <div className="section-eyebrow">
                        <Fingerprint size={17} /> START WITH A PERSON
                      </div>
                      <h2>Who needs a fresh start?</h2>
                      <p>
                        Enter a customer name or email. We'll follow their data
                        <br className="desktop-only" /> across your connected
                        systems.
                      </p>
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          await mutate(
                            "/api/cases",
                            { query },
                            "Identifying the customer…",
                          );
                        }}
                      >
                        <label className="field-label" htmlFor="customer-query">
                          Customer name or email
                        </label>
                        <div className="search-input">
                          <Search size={19} />
                          <input
                            id="customer-query"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="alex.morgan@example.com"
                            required
                            minLength={2}
                            maxLength={200}
                            autoComplete="off"
                          />
                          <kbd>↵</kbd>
                        </div>
                        <Button
                          type="submit"
                          disabled={!!busy || query.trim().length < 2}
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <ScanLine size={17} />
                          )}{" "}
                          Start erasure request <ArrowRight size={16} />
                        </Button>
                      </form>
                      <div className="sample-note">
                        <span className="sample-avatar">AM</span>
                        <span>
                          Try{" "}
                          <button
                            onClick={() => setQuery("alex.morgan@example.com")}
                          >
                            alex.morgan@example.com
                          </button>
                          <small>
                            A ready-to-explore customer, with a few interesting
                            edge cases.
                          </small>
                        </span>
                      </div>
                    </section>
                    <section className="trust-card">
                      <div className="trust-illustration">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <div className="orbit-node node-one">
                          <SourceIcon platform="slack" size={25} />
                        </div>
                        <div className="orbit-node node-two">
                          <SourceIcon platform="drive" size={26} />
                        </div>
                        <div className="orbit-node node-three">
                          <SourceIcon platform="notion" size={24} />
                        </div>
                        <div className="center-shield">
                          <ShieldCheck size={43} strokeWidth={1.35} />
                        </div>
                        <span className="orbit-spark spark-one">+</span>
                        <span className="orbit-spark spark-two">+</span>
                      </div>
                      <span className="section-eyebrow">
                        AUTOMATION, WITH ACCOUNTABILITY
                      </span>
                      <h3>
                        Powerful by design.
                        <br />
                        Careful by default.
                      </h3>
                      <p>
                        No deletion happens without your approval.
                        <br />
                        Protected records always stay protected.
                      </p>
                      <div className="trust-footer">
                        <LockKeyhole size={13} /> Scoped agents <span>·</span>{" "}
                        Full audit trail
                      </div>
                    </section>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h3>Five systems. One workflow.</h3>
                      <p>
                        A complete synthetic workspace, ready for a guided
                        walkthrough.
                      </p>
                    </div>
                    <span className="quiet-label">
                      <span className="status-dot" /> 15 seeded records
                    </span>
                  </div>
                  <SourceCards
                    data={data}
                    onClick={() => setModal("sources")}
                  />
                  <div className="intro-footer">
                    <div>
                      <span className="footer-step">01</span>
                      <span>
                        <strong>Discover the data</strong>
                        <small>
                          Follow verified identifiers across systems.
                        </small>
                      </span>
                    </div>
                    <div>
                      <span className="footer-step">02</span>
                      <span>
                        <strong>Make the right call</strong>
                        <small>
                          Inspect AI proposals and approve the plan.
                        </small>
                      </span>
                    </div>
                    <div>
                      <span className="footer-step">03</span>
                      <span>
                        <strong>Leave a clear record</strong>
                        <small>Verify outcomes and export the evidence.</small>
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <section className="case-summary panel">
                    <div className="case-person">
                      <span className="person-avatar">AM</span>
                      <div>
                        <div className="case-title">
                          <h2>{c.subject?.name ?? c.query}</h2>
                          <span className="case-ref">{c.reference}</span>
                        </div>
                        <p>
                          {c.subject?.email ??
                            `${c.candidates.length} matching ${c.candidates.length === 1 ? "identity" : "identities"} · Confirmation required`}
                        </p>
                      </div>
                    </div>
                    <div className="case-meta">
                      <div>
                        <span>RECEIVED</span>
                        <strong>{formatDate(c.receivedAt)}</strong>
                      </div>
                      <div>
                        <span>RESPONSE DUE</span>
                        <strong>
                          <Clock3 size={13} /> {formatDate(c.deadline)}
                        </strong>
                      </div>
                      <span
                        className={cn(
                          "badge",
                          c.verification?.complete
                            ? "badge-retain"
                            : "badge-neutral",
                        )}
                      >
                        {c.verification?.complete ? (
                          <>
                            <CircleCheck size={13} /> Verified
                          </>
                        ) : c.stage === "review" ? (
                          "Awaiting review"
                        ) : c.stage === "approved" ? (
                          "Plan approved"
                        ) : c.stage === "verified" ? (
                          "Action required"
                        ) : (
                          "In progress"
                        )}
                      </span>
                    </div>
                  </section>

                  {c.stage === "identify" && (
                    <section className="panel identity-panel">
                      <div className="section-eyebrow">
                        <Fingerprint size={16} /> IDENTITY RESOLUTION
                      </div>
                      <h2>Let's make sure it's the right person.</h2>
                      <p>
                        A name can match more than one person. Confirm the
                        customer before searching their data.
                      </p>
                      <div className="candidate-grid">
                        {c.candidates.map((subject) => (
                          <button
                            key={subject.id}
                            data-testid={`candidate-${subject.id}`}
                            className={cn(
                              "candidate",
                              selectedSubject === subject.id && "selected",
                            )}
                            onClick={() => setSelectedSubject(subject.id)}
                          >
                            <span className="radio-indicator">
                              {selectedSubject === subject.id && <span />}
                            </span>
                            <div>
                              <strong>{subject.name}</strong>
                              <span>{subject.email}</span>
                              <small>{subject.company}</small>
                            </div>
                            <span className="badge badge-neutral">
                              {subject.id.includes("customer")
                                ? "Customer"
                                : "Partner"}
                            </span>
                          </button>
                        ))}
                      </div>
                      {selectedSubject && (
                        <div className="identifiers">
                          <span className="field-label">
                            Verified identifiers & provenance
                          </span>
                          <div className="identifier-grid">
                            {c.candidates
                              .find((s) => s.id === selectedSubject)
                              ?.identifiers.map((identifier) => (
                                <div
                                  className="identifier"
                                  key={identifier.value}
                                >
                                  <span>{identifier.kind}</span>
                                  <strong>{identifier.value}</strong>
                                  <small>{identifier.source}</small>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      <div className="identity-confirm">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={attested}
                            onChange={(event) =>
                              setAttested(event.target.checked)
                            }
                          />
                          <span>
                            I confirm this identity for the demo.
                            <small>
                              This is a simulated operator attestation, not real
                              identity verification.
                            </small>
                          </span>
                        </label>
                        <Button
                          disabled={!selectedSubject || !attested || !!busy}
                          onClick={() =>
                            command(
                              {
                                type: "confirm",
                                subjectId: selectedSubject,
                                attested,
                              },
                              "Confirming identity…",
                            )
                          }
                        >
                          Confirm identity <ArrowRight size={16} />
                        </Button>
                      </div>
                    </section>
                  )}

                  {(c.stage === "discover" || c.stage === "classify") && (
                    <section className="panel discovery-panel">
                      <div
                        className={cn("discovery-icon", !!busy && "pulsing")}
                      >
                        <ScanLine size={29} />
                      </div>
                      <div className="section-eyebrow">
                        {c.stage === "classify"
                          ? "CLASSIFICATION"
                          : "READY TO DISCOVER"}
                      </div>
                      <h2>
                        {busy ||
                          (c.stage === "classify"
                            ? "The evidence is in. Let's build a plan."
                            : "Follow the identifiers. Find the data.")}
                      </h2>
                      <p>
                        {c.subject!.identifiers.length} confirmed identifiers.
                        Five simulated systems.
                        <br />
                        The agent can propose changes. Only you can approve
                        them.
                      </p>
                      <div className="discovery-sources">
                        {data.sources.map((source) => (
                          <SourceIcon
                            key={source.platform}
                            platform={source.platform}
                            size={43}
                          />
                        ))}
                      </div>
                      <Button
                        disabled={!!busy}
                        onClick={
                          c.stage === "discover"
                            ? discover
                            : () =>
                                command(
                                  { type: "classify" },
                                  "Preparing action proposals…",
                                )
                        }
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Sparkles size={17} />
                        )}
                        {c.stage === "discover"
                          ? "Discover & classify"
                          : "Classify findings"}
                        <ArrowRight size={16} />
                      </Button>
                      <small className="discovery-note">
                        {data.aiConfigured
                          ? "Live AI classification enabled · 25 second timeout with scripted fallback"
                          : "Scripted fallback ready · Add an API key to enable live classification"}
                      </small>
                    </section>
                  )}

                  {c.proposals.length > 0 && (
                    <>
                      <div className="findings-summary">
                        <StatCard
                          title="Records discovered"
                          value={c.findings.length}
                          icon={<ScanLine size={17} />}
                          sub="Across 5 simulated systems"
                        />
                        <StatCard
                          title="To delete"
                          value={
                            c.proposals.filter(
                              (p) => p.action === "delete" && !p.needsReview,
                            ).length
                          }
                          icon={<Trash2 size={17} />}
                          tone="delete"
                          sub="Customer-specific records"
                        />
                        <StatCard
                          title="To redact"
                          value={
                            c.proposals.filter(
                              (p) => p.action === "redact" && !p.needsReview,
                            ).length
                          }
                          icon={<Eraser size={17} />}
                          tone="redact"
                          sub="Keep context, remove identifiers"
                        />
                        <StatCard
                          title="Protected"
                          value={
                            c.findings.filter((f) => f.record.policyId).length
                          }
                          icon={<ShieldCheck size={17} />}
                          tone="retain"
                          sub="Locked by retention policy"
                        />
                      </div>

                      {c.verification && (
                        <section
                          className={cn(
                            "verification-banner",
                            c.verification.complete
                              ? "verification-success"
                              : "verification-pending",
                          )}
                        >
                          <div className="verification-icon">
                            {c.verification.complete ? (
                              <CheckCheck size={26} />
                            ) : (
                              <CircleHelp size={26} />
                            )}
                          </div>
                          <div>
                            <h3>
                              {c.verification.complete
                                ? "Every finding. Accounted for."
                                : "A clear record includes what remains."}
                            </h3>
                            <p>
                              {c.verification.complete
                                ? `${c.verification.removed.length} removed or redacted · ${c.verification.retained.length} retained with reason · ${c.verification.dismissed.length} false positives dismissed`
                                : `${c.verification.unresolved.length} unresolved finding(s). Review the evidence before completing this request.`}
                            </p>
                            <small>
                              {c.verification.complete
                                ? "Completed within simulated scope. This is not GDPR certification."
                                : c.verification.unresolved[0]?.reason}
                            </small>
                          </div>
                          <Button
                            variant={
                              c.verification.complete ? "default" : "outline"
                            }
                            asChild
                          >
                            <a href={`/report/${c.id}`}>
                              <FileCheck2 size={16} /> View report{" "}
                              <ArrowUpRight size={15} />
                            </a>
                          </Button>
                        </section>
                      )}

                      <section className="panel findings-panel">
                        <div className="findings-heading">
                          <div>
                            <h3>
                              {c.results.length
                                ? "Actions & outcomes"
                                : "Your proposed action plan"}{" "}
                              <span className="count-pill">
                                {c.findings.length}
                              </span>
                            </h3>
                            <p>
                              {c.results.length
                                ? "Every approved action, its result, and the evidence behind it."
                                : "Review the evidence. Adjust the actions. You're the final checkpoint."}
                            </p>
                          </div>
                          <button
                            className={cn(
                              "model-badge",
                              c.classification?.mode === "live" && "live",
                            )}
                            onClick={() => setModal("about")}
                          >
                            <Sparkles size={13} />
                            {c.classification?.mode === "live"
                              ? "Live AI"
                              : "Scripted fallback"}
                            <CircleHelp size={12} />
                          </button>
                        </div>
                        <div className="findings-toolbar">
                          <div
                            className="filter-tabs"
                            role="group"
                            aria-label="Filter findings"
                          >
                            {[
                              {
                                key: "all",
                                label: "All findings",
                                count: c.findings.length,
                              },
                              {
                                key: "review",
                                label: "Needs review",
                                count: needsReview,
                              },
                              { key: "delete", label: "Delete" },
                              { key: "redact", label: "Redact" },
                              { key: "retain", label: "Retain" },
                            ].map((tab) => (
                              <button
                                key={tab.key}
                                className={cn(
                                  filter === tab.key && "selected",
                                  tab.key === "review" &&
                                    needsReview > 0 &&
                                    "attention-tab",
                                )}
                                onClick={() => setFilter(tab.key)}
                              >
                                {tab.label}
                                {tab.count !== undefined && (
                                  <span>{tab.count}</span>
                                )}
                              </button>
                            ))}
                          </div>
                          <select
                            aria-label="Filter by source"
                            value={sourceFilter}
                            onChange={(event) =>
                              setSourceFilter(
                                event.target.value as Platform | "all",
                              )
                            }
                          >
                            <option value="all">All sources</option>
                            {data.sources.map((source) => (
                              <option
                                key={source.platform}
                                value={source.platform}
                              >
                                {platformNames[source.platform]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="table-scroll">
                          <table className="findings-table">
                            <thead>
                              <tr>
                                <th>RECORD / SOURCE</th>
                                <th>MATCHED IDENTIFIER</th>
                                <th>PROPOSED ACTION</th>
                                <th>{c.results.length ? "RESULT" : "BASIS"}</th>
                                <th>
                                  <span className="sr-only">Inspect</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleFindings.map((f) => {
                                const p = c.proposals.find(
                                  (p) => p.findingId === f.id,
                                )!;
                                const result = c.results.find(
                                  (r) => r.findingId === f.id,
                                );
                                return (
                                  <tr
                                    key={f.id}
                                    className={cn(
                                      p.needsReview && "needs-review-row",
                                    )}
                                  >
                                    <td>
                                      <button
                                        className="record-button"
                                        onClick={() => openFinding(f)}
                                      >
                                        <SourceIcon
                                          platform={f.record.platform}
                                          size={32}
                                        />
                                        <span>
                                          <strong>{f.record.title}</strong>
                                          <small>
                                            {platformNames[f.record.platform]}{" "}
                                            <span> / </span> {f.record.location}
                                          </small>
                                        </span>
                                      </button>
                                    </td>
                                    <td>
                                      <span className="identifier-chip">
                                        {f.matchedIdentifiers[0]}
                                      </span>
                                      {f.matchedIdentifiers.length > 1 && (
                                        <span className="extra-matches">
                                          +{f.matchedIdentifiers.length - 1}
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      <button
                                        className="verdict-button"
                                        onClick={() => openFinding(f)}
                                        aria-label={`Review verdict for ${f.record.title}`}
                                      >
                                        <ActionBadge
                                          action={p.action}
                                          needsReview={p.needsReview}
                                        />
                                        <ChevronRight size={12} />
                                      </button>
                                    </td>
                                    <td>
                                      {result ? (
                                        <span
                                          className={cn(
                                            "result-label",
                                            result.status,
                                          )}
                                        >
                                          {result.status === "succeeded" ? (
                                            <CircleCheck size={13} />
                                          ) : (
                                            <CircleHelp size={13} />
                                          )}
                                          {result.status === "succeeded"
                                            ? "Applied"
                                            : result.status === "stale"
                                              ? "Changed"
                                              : "Retry needed"}
                                        </span>
                                      ) : (
                                        <span className="basis-label">
                                          {f.record.policyId ? (
                                            <>
                                              <LockKeyhole size={12} /> Policy
                                              protected
                                            </>
                                          ) : f.uncertain ? (
                                            <>
                                              <CircleHelp size={12} /> Identity
                                              mismatch
                                            </>
                                          ) : p.origin === "human" ? (
                                            <>
                                              <Check size={12} /> Human reviewed
                                            </>
                                          ) : (
                                            <>
                                              <Sparkles size={12} />{" "}
                                              {f.record.kind === "shared"
                                                ? "Shared content"
                                                : "Personal record"}
                                            </>
                                          )}
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      <button
                                        className="row-open"
                                        aria-label={`Review ${f.record.title}`}
                                        onClick={() => openFinding(f)}
                                      >
                                        <ChevronRight size={17} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {visibleFindings.length === 0 && (
                            <div className="empty-filter">
                              <Search size={22} />
                              <p>No findings in this view.</p>
                              <button
                                onClick={() => {
                                  setFilter("all");
                                  setSourceFilter("all");
                                }}
                              >
                                Clear filters
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="table-footer">
                          <span>
                            <ShieldCheck size={14} /> Protected records cannot
                            be changed by the agent or reviewer.
                          </span>
                          <span>
                            Plan v{c.planVersion} · {visibleFindings.length} of{" "}
                            {c.findings.length} records
                          </span>
                        </div>
                      </section>

                      <section className="approval-bar panel">
                        <div className="approval-copy">
                          <span className="approval-icon">
                            {c.approval ? (
                              <ShieldCheck size={21} />
                            ) : (
                              <ShieldEllipsis size={21} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {c.stage === "review"
                                ? needsReview
                                  ? `${needsReview} identity matches need your attention`
                                  : "The plan is ready for your approval"
                                : c.stage === "approved"
                                  ? "Approved. Ready to execute."
                                  : c.stage === "executed"
                                    ? failed
                                      ? `${failed} action needs a retry`
                                      : "Actions applied. Verify the outcome."
                                    : c.verification?.complete
                                      ? "A complete trail, from request to result"
                                      : "Some findings still need action"}
                            </strong>
                            <p>
                              {c.stage === "review"
                                ? needsReview
                                  ? "Open the flagged records and confirm whether they belong to this customer."
                                  : "No data will change until you approve and execute this exact plan."
                                : c.approval
                                  ? `Approved by ${c.approval.reviewer} · ${formatTime(c.approval.timestamp)} · plan v${c.approval.planVersion}`
                                  : "Refresh the findings to review changed records and approve a new plan."}
                            </p>
                          </div>
                        </div>
                        <div className="approval-actions">
                          {c.stage === "review" && (
                            <>
                              <Button
                                variant="ghost"
                                disabled={!!busy}
                                onClick={() =>
                                  command(
                                    { type: "refresh" },
                                    "Refreshing source snapshots…",
                                  )
                                }
                              >
                                <RefreshCw size={14} /> Refresh
                              </Button>
                              <Button
                                disabled={!!busy || needsReview > 0}
                                onClick={() => {
                                  setApprovedCheck(false);
                                  setModal("approve");
                                }}
                              >
                                <ShieldCheck size={16} /> Review & approve{" "}
                                <ArrowRight size={15} />
                              </Button>
                            </>
                          )}
                          {c.stage === "approved" && (
                            <>
                              <label className="failure-toggle">
                                <input
                                  type="checkbox"
                                  checked={simulateFailure}
                                  onChange={(event) =>
                                    setSimulateFailure(event.target.checked)
                                  }
                                />{" "}
                                Simulate connector failure
                              </label>
                              <Button
                                disabled={!!busy}
                                onClick={() =>
                                  command(
                                    { type: "execute", simulateFailure },
                                    "Executing approved actions…",
                                  )
                                }
                              >
                                <Zap size={16} /> Execute approved plan
                              </Button>
                            </>
                          )}
                          {(c.stage === "executed" ||
                            (c.stage === "verified" &&
                              !c.verification?.complete)) && (
                            <>
                              {failed > 0 && (
                                <Button
                                  variant="outline"
                                  disabled={!!busy}
                                  onClick={() =>
                                    command(
                                      {
                                        type: "execute",
                                        simulateFailure: false,
                                      },
                                      "Retrying failed actions…",
                                    )
                                  }
                                >
                                  <RefreshCw size={15} /> Retry failed actions
                                </Button>
                              )}
                              {c.stage === "verified" && failed === 0 && (
                                <Button
                                  variant="outline"
                                  disabled={!!busy}
                                  onClick={() =>
                                    command(
                                      { type: "refresh" },
                                      "Reopening unresolved findings…",
                                    )
                                  }
                                >
                                  Review unresolved
                                </Button>
                              )}
                              <Button
                                disabled={!!busy}
                                onClick={() =>
                                  command(
                                    { type: "verify" },
                                    "Re-reading records & searching again…",
                                  )
                                }
                              >
                                <ScanLine size={16} /> Verify outcomes
                              </Button>
                            </>
                          )}
                          {c.verification?.complete && (
                            <Button variant="outline" asChild>
                              <a href={`/api/cases/${c.id}/report`}>
                                <ArrowDownToLine size={15} /> Export audit JSON
                              </a>
                            </Button>
                          )}
                        </div>
                      </section>
                    </>
                  )}

                  <section className="panel audit-panel" id="audit-trail">
                    <button
                      className="audit-toggle"
                      onClick={() => setShowAudit(!showAudit)}
                      aria-expanded={showAudit}
                    >
                      <div>
                        <Activity size={17} />
                        <strong>Every step, on the record</strong>
                        <span className="count-pill">{c.audit.length}</span>
                      </div>
                      <span>
                        {showAudit ? "Hide activity" : "View audit trail"}
                        <ChevronRight
                          size={16}
                          className={cn(showAudit && "rotate-90")}
                        />
                      </span>
                    </button>
                    {showAudit && (
                      <div className="audit-list">
                        {[...c.audit].reverse().map((event) => (
                          <div className="audit-event" key={event.id}>
                            <span
                              className={`audit-dot actor-${event.actor}`}
                            />
                            <span className="audit-time">
                              {formatTime(event.timestamp)}
                            </span>
                            <div>
                              <span className="audit-actor">{event.actor}</span>
                              <strong>
                                {event.event.replaceAll(".", " / ")}
                              </strong>
                              <p>{event.message}</p>
                              {event.recordId && <code>{event.recordId}</code>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
              <footer className="page-footer">
                <span>
                  <FlaskConical size={13} /> Synthetic data. Simulated
                  connectors. Real human control.
                </span>
                <button onClick={() => setModal("about")}>
                  Demo scope & limitations <ArrowUpRight size={12} />
                </button>
              </footer>
            </>
          )}
        </main>
      </div>
      {!!busy && (
        <div className="busy-toast" role="status">
          <LoaderCircle className="spin" size={17} />
          {busy}
        </div>
      )}

      <Dialog
        open={!!selectedFinding}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFinding(null);
            setError("");
          }
        }}
      >
        <DialogContent drawer>
          {finding && c && (
            <>
              <div className="drawer-heading">
                <div className="section-eyebrow">
                  <SourceIcon platform={finding.record.platform} size={24} />{" "}
                  {platformNames[finding.record.platform]} / RECORD INSPECTOR
                </div>
                <DialogTitle>{finding.record.title}</DialogTitle>
                <DialogDescription>{finding.record.location}</DialogDescription>
                <div className="drawer-badges">
                  <ActionBadge
                    action={previewAction}
                    needsReview={proposal?.needsReview && !hasReviewChanges}
                  />
                  {hasReviewChanges && (
                    <span className="badge badge-neutral">
                      Unsaved decision
                    </span>
                  )}
                  <span className="badge badge-neutral">
                    {finding.matchedIdentifiers.length} matched identifiers
                  </span>
                </div>
              </div>
              <div className="drawer-body">
                {canReview && (
                  <form className="review-form" onSubmit={saveReview}>
                    <div className="detail-section-label">
                      <MessageSquareText size={15} /> YOUR DECISION
                    </div>
                    {finding.uncertain ? (
                      <p className="review-hint">
                        Dismiss — this record belongs to a different person.
                      </p>
                    ) : (
                      <>
                        <fieldset className="verdict-picker" disabled={!!busy}>
                          <legend className="sr-only">Finding verdict</legend>
                          {(
                            [
                              {
                                action: "delete",
                                label: "Delete",
                                Icon: Trash2,
                              },
                              {
                                action: "redact",
                                label: "Redact",
                                Icon: Eraser,
                              },
                              {
                                action: "retain",
                                label: "Retain",
                                Icon: ShieldCheck,
                              },
                            ] as const
                          ).map(({ action, label, Icon }) => (
                            <label
                              className={`verdict-option verdict-${action}`}
                              key={action}
                            >
                              <input
                                type="radio"
                                name="finding-verdict"
                                value={action}
                                checked={editAction === action}
                                onChange={() => setEditAction(action)}
                              />
                              <Icon size={15} aria-hidden="true" />
                              {label}
                            </label>
                          ))}
                        </fieldset>
                        <label className="false-positive-option">
                          <input
                            type="checkbox"
                            checked={editAction === "dismiss"}
                            disabled={!!busy}
                            onChange={(event) =>
                              setEditAction(
                                event.target.checked
                                  ? "dismiss"
                                  : proposal?.action === "dismiss"
                                    ? "redact"
                                    : (proposal?.action ?? "redact"),
                              )
                            }
                          />
                          Exclude as a false positive
                        </label>
                      </>
                    )}
                    <p className="review-hint">
                      {finding.uncertain
                        ? "Record why this match should be excluded."
                        : "Choose a verdict and record your reason."}{" "}
                      Saving changes requires a fresh approval of the final
                      plan.
                    </p>
                    <label className="field-label" htmlFor="review-reason">
                      Reason for your decision
                    </label>
                    <textarea
                      id="review-reason"
                      rows={3}
                      value={editReason}
                      onChange={(event) => setEditReason(event.target.value)}
                      minLength={8}
                      maxLength={1000}
                      required
                      placeholder={
                        finding.uncertain
                          ? "Different email and company confirm this is another person."
                          : "Explain why this is the appropriate action…"
                      }
                    />
                    {finding.uncertain && (
                      <button
                        type="button"
                        className="suggested-reason"
                        onClick={() =>
                          setEditReason(
                            "Different email and company confirm this is another person. Exclude this record from the request.",
                          )
                        }
                      >
                        Use the identity evidence <ArrowRight size={12} />
                      </button>
                    )}
                    {error && (
                      <p className="inline-error" role="alert">
                        {error}
                      </p>
                    )}
                    <Button
                      disabled={!!busy || editReason.trim().length < 8}
                      type="submit"
                    >
                      <Check size={16} />
                      {finding.uncertain
                        ? "Confirm false positive"
                        : "Save review decision"}
                    </Button>
                  </form>
                )}
                <section
                  className={cn(
                    "rationale-card",
                    finding.uncertain && "rationale-warning",
                  )}
                >
                  <div>
                    <span>
                      {finding.uncertain ? (
                        <CircleHelp size={16} />
                      ) : finding.record.policyId ? (
                        <LockKeyhole size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                    </span>
                    <strong>
                      {finding.uncertain
                        ? "Same name. Different person."
                        : finding.record.policyId
                          ? "Protected by a deterministic rule"
                          : "Saved proposal"}
                    </strong>
                  </div>
                  <p>{proposal?.rationale ?? "Classification is pending."}</p>
                  {proposal?.origin && (
                    <small>
                      Source:{" "}
                      {proposal.origin === "ai"
                        ? "Live AI proposal"
                        : proposal.origin === "scripted"
                          ? "Scripted demo proposal"
                          : proposal.origin === "human"
                            ? "Human review"
                            : "Protection policy"}
                    </small>
                  )}
                </section>
                {finding.record.policyId && (
                  <div className="policy-detail">
                    {data?.policies
                      .filter((p) => p.id === finding.record.policyId)
                      .map((policy) => (
                        <div key={policy.id}>
                          <span className="field-label">
                            {policy.name} · {policy.id}
                          </span>
                          <p>{policy.legalBasis}</p>
                          <strong>
                            Retention review: {formatDate(policy.reviewDate)}
                          </strong>
                          <small>
                            This rule cannot be overridden through an erasure
                            request.
                          </small>
                        </div>
                      ))}
                  </div>
                )}
                <div className="detail-section-label">MATCH EVIDENCE</div>
                <div className="matched-tags">
                  {finding.matchedIdentifiers.map((identifier) => (
                    <span className="identifier-chip" key={identifier}>
                      {identifier}
                    </span>
                  ))}
                </div>
                <div className="detail-section-label">
                  {previewAction === "redact"
                    ? "EXACT REDACTION PREVIEW"
                    : "SOURCE SNAPSHOT"}
                  <span>Read at discovery</span>
                </div>
                <div className="source-preview">
                  <div className="preview-label">
                    <span className="preview-dot" /> Before
                  </div>
                  <h4>
                    <Highlight
                      text={finding.record.title}
                      spans={previewSpans.filter((s) => s.field === "title")}
                    />
                  </h4>
                  <pre>
                    <Highlight
                      text={finding.record.content}
                      spans={previewSpans.filter((s) => s.field === "content")}
                    />
                  </pre>
                </div>
                {previewAction === "redact" && (
                  <div className="source-preview after-preview">
                    <div className="preview-label">
                      <span className="preview-dot" /> After approval &
                      execution
                    </div>
                    <h4>
                      <Highlight
                        text={finding.record.title}
                        spans={previewSpans.filter((s) => s.field === "title")}
                        after
                      />
                    </h4>
                    <pre>
                      <Highlight
                        text={finding.record.content}
                        spans={previewSpans.filter(
                          (s) => s.field === "content",
                        )}
                        after
                      />
                    </pre>
                    <small>
                      Redaction preserves surrounding content. It is not a
                      guarantee of irreversible anonymization.
                    </small>
                  </div>
                )}
                {previewAction === "delete" && (
                  <div className="delete-consequence">
                    <Trash2 size={17} />
                    <div>
                      <strong>
                        The whole synthetic record will be deleted.
                      </strong>
                      <p>
                        Its title and content will be removed from the mock
                        source. Other people's records will not be affected.
                        Demo source snapshots remain available here for
                        comparison.
                      </p>
                    </div>
                  </div>
                )}
                {previewAction === "retain" && !finding.record.policyId && (
                  <div className="execution-detail">
                    <strong>The source record will be preserved.</strong>
                    <p>
                      Your reason will be recorded in the audit log and
                      completion report.
                    </p>
                  </div>
                )}
                {c.results.find((r) => r.findingId === finding.id) && (
                  <div className="execution-detail">
                    <strong>Execution result</strong>
                    <p>
                      {
                        c.results.find((r) => r.findingId === finding.id)
                          ?.message
                      }
                    </p>
                    <small>
                      Attempts:{" "}
                      {
                        c.results.find((r) => r.findingId === finding.id)
                          ?.attempts
                      }
                    </small>
                  </div>
                )}
              </div>
              <div className="drawer-footer">
                <LockKeyhole size={13} />
                <span>
                  Changes apply only after human approval of the final plan.
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setModal(null);
            setError("");
          }
        }}
      >
        <DialogContent className={cn(modal === "sources" && "wide-dialog")}>
          {modal === "approve" && c && (
            <>
              <span className="modal-icon">
                <ShieldCheck size={26} />
              </span>
              <DialogTitle>Your approval is the checkpoint.</DialogTitle>
              <DialogDescription>
                Approve plan v{c.planVersion} for {c.subject?.name}. Execution
                will apply only these recorded actions to unchanged source
                records.
              </DialogDescription>
              <div className="approval-counts">
                {(["delete", "redact", "retain", "dismiss"] as Action[]).map(
                  (action) => (
                    <div key={action}>
                      <strong>
                        {c.proposals.filter((p) => p.action === action).length}
                      </strong>
                      <ActionBadge action={action} />
                    </div>
                  ),
                )}
              </div>
              <label className="field-label" htmlFor="reviewer-name">
                Reviewer name
              </label>
              <input
                className="text-input"
                id="reviewer-name"
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
                maxLength={100}
              />
              <label className="checkbox-label approval-checkbox">
                <input
                  type="checkbox"
                  checked={approvedCheck}
                  onChange={(event) => setApprovedCheck(event.target.checked)}
                />
                <span>
                  I've reviewed the proposed actions and retention reasons, and
                  approve this exact plan.
                  <small>
                    Any change to the plan or source content requires fresh
                    approval.
                  </small>
                </span>
              </label>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <Button variant="outline" onClick={() => setModal(null)}>
                  Back to review
                </Button>
                <Button
                  disabled={
                    !approvedCheck || reviewer.trim().length < 2 || !!busy
                  }
                  onClick={async () => {
                    if (
                      await command(
                        {
                          type: "approve",
                          reviewer,
                          confirmed: approvedCheck,
                          planVersion: c.planVersion,
                        },
                        "Recording your approval…",
                      )
                    )
                      setModal(null);
                  }}
                >
                  <ShieldCheck size={16} /> Approve plan
                </Button>
              </div>
            </>
          )}
          {modal === "reset" && (
            <>
              <span className="modal-icon">
                <RotateCcw size={25} />
              </span>
              <DialogTitle>Ready for another walkthrough?</DialogTitle>
              <DialogDescription>
                This restores all 15 synthetic records and clears the current
                case, approvals, and audit trail. Download the audit first if
                you'd like to keep it.
              </DialogDescription>
              <div className="modal-actions">
                <Button variant="outline" onClick={() => setModal(null)}>
                  Keep this case
                </Button>
                <Button
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      await mutate(
                        "/api/reset",
                        { confirmed: true },
                        "Restoring the demo…",
                      )
                    ) {
                      setModal(null);
                      setSelectedFinding(null);
                      setSelectedSubject("");
                      setAttested(false);
                      setFilter("all");
                      setSourceFilter("all");
                      setShowAudit(false);
                      setSimulateFailure(false);
                    }
                  }}
                >
                  <RotateCcw size={15} /> Reset & start fresh
                </Button>
              </div>
            </>
          )}
          {modal === "policies" && (
            <>
              <span className="modal-icon">
                <FolderLock size={25} />
              </span>
              <DialogTitle>Some records stay protected.</DialogTitle>
              <DialogDescription>
                These deterministic rules run before classification and
                immediately before execution. The AI and case reviewer cannot
                override them.
              </DialogDescription>
              <div className="policy-list">
                {data?.policies.map((policy) => (
                  <div className="policy-card" key={policy.id}>
                    <div>
                      <LockKeyhole size={17} />
                      <strong>{policy.name}</strong>
                      <span className="badge badge-retain">Locked</span>
                    </div>
                    <p>{policy.reason}</p>
                    <small>{policy.legalBasis}</small>
                    <footer>
                      Review date{" "}
                      <strong>{formatDate(policy.reviewDate)}</strong>
                    </footer>
                  </div>
                ))}
              </div>
              <p className="modal-footnote">
                Protection prevents writes. It does not independently prove a
                legal right to retain data. These are illustrative demo
                policies.
              </p>
            </>
          )}
          {modal === "sources" && (
            <>
              <span className="modal-icon">
                <Database size={25} />
              </span>
              <DialogTitle>Five systems. Safely simulated.</DialogTitle>
              <DialogDescription>
                Each connector discovers, reads, executes approved changes, and
                verifies results against a local synthetic dataset.
              </DialogDescription>
              <div className="source-modal-list">
                {data?.sources.map((source) => (
                  <div key={source.platform}>
                    <SourceIcon platform={source.platform} size={35} />
                    <span>
                      <strong>{platformNames[source.platform]}</strong>
                      <small>
                        {source.active} active / {source.total} seeded records{" "}
                        {source.protected > 0 &&
                          `· ${source.protected} protected`}
                      </small>
                    </span>
                    <span className="badge badge-neutral">Simulated</span>
                  </div>
                ))}
              </div>
              <p className="modal-footnote">
                No external accounts are connected. Real platform permissions,
                revision history, backups, and deletion capabilities require
                separate integration work.
              </p>
            </>
          )}
          {modal === "about" && (
            <>
              <span className="modal-icon">
                <FlaskConical size={25} />
              </span>
              <DialogTitle>Real controls. Synthetic data.</DialogTitle>
              <DialogDescription>
                Dragon Erase demonstrates an accountable erasure workflow for a
                single company. Everything runs locally except optional AI
                classification.
              </DialogDescription>
              <div className="about-sections">
                <section>
                  <h4>
                    <Sparkles size={16} /> Narrowly scoped AI
                  </h4>
                  <p>
                    The model only proposes classifications and exact redaction
                    spans. It has no mutation tools, connector credentials,
                    browser, or shell.
                  </p>
                  <p>
                    {c?.classification?.reason ??
                      (data?.aiConfigured
                        ? "Live AI is configured. Failed or invalid responses use labeled scripted proposals."
                        : "Scripted mode is ready. Set OPENAI_API_KEY in .env.local and restart to enable live AI.")}
                  </p>
                </section>
                <section>
                  <h4>
                    <Clock3 size={16} /> GDPR-informed workflow
                  </h4>
                  <p>
                    The response deadline is one calendar month from receipt.
                    Legal exceptions and extensions require human judgment. This
                    report is not GDPR certification.
                  </p>
                  <a
                    href="https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the EDPB guidance <ArrowUpRight size={12} />
                  </a>
                </section>
                <section>
                  <h4>
                    <GitBranch size={16} /> What's outside the demo
                  </h4>
                  <p>
                    Real identity checks, live connectors, legal validation,
                    recipient notices, backups, version histories, and
                    irreversible anonymization. Audit logs and source snapshots
                    contain synthetic data and are cleared by Reset.
                  </p>
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  title: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat-card panel">
      <div>
        <span>{title}</span>
        <span className={`stat-icon stat-${tone}`}>{icon}</span>
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{sub}</small>
    </div>
  );
}

function SourceCards({
  data,
  onClick,
}: {
  data: AppState;
  onClick: () => void;
}) {
  return (
    <div className="source-cards">
      {data.sources.map((source) => (
        <button
          className="source-card panel"
          key={source.platform}
          onClick={onClick}
        >
          <div>
            <SourceIcon platform={source.platform} size={35} />
            <span className="source-status" title="Simulated source ready" />
          </div>
          <strong>{platformNames[source.platform]}</strong>
          <span>
            {source.total} records <span>·</span> Simulated
          </span>
        </button>
      ))}
    </div>
  );
}
