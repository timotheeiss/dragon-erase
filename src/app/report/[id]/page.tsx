import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  CircleCheck,
  CircleHelp,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { getStore } from "@/lib/server/store";
import { exportReport } from "@/lib/server/workflow";
import { platformNames, type Platform } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const c = getStore().getCase((await params).id);
  if (!c)
    return (
      <div className="report-no-case">
        <h1>This demo case is no longer available.</h1>
        <p>It may have been cleared by a reset.</p>
        <Link href="/">Return to the workspace</Link>
      </div>
    );
  const report = exportReport(c);
  return (
    <div className="report-shell">
      <div className="report-toolbar">
        <Button variant="ghost" asChild>
          <Link href="/">
            <ArrowLeft size={14} /> Back to request
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/cases/${c.id}/report`}>
            <ArrowDownToLine size={14} /> Download audit JSON
          </a>
        </Button>
        <PrintButton />
      </div>
      <article className="report-paper">
        <div className="report-brand">
          <ShieldCheck size={25} /> dragonerase
        </div>
        <div className="report-kicker">SYNTHETIC WORKSPACE · {c.reference}</div>
        <h1>Demo execution report</h1>
        <div
          className={`report-status ${c.verification?.complete ? "" : "incomplete"}`}
        >
          {c.verification?.complete ? (
            <CircleCheck size={21} />
          ) : (
            <CircleHelp size={21} />
          )}
          {report.status}
        </div>
        <dl className="report-meta">
          <div>
            <dt>Customer</dt>
            <dd>{c.subject?.name ?? "Identity not confirmed"}</dd>
          </div>
          <div>
            <dt>Subject reference</dt>
            <dd>{report.subjectReference ?? "Not confirmed"}</dd>
          </div>
          <div>
            <dt>Request received</dt>
            <dd>{date(c.receivedAt)}</dd>
          </div>
          <div>
            <dt>Response due</dt>
            <dd>{date(c.deadline)}</dd>
          </div>
          <div>
            <dt>Reviewer</dt>
            <dd>{c.approval?.reviewer ?? "Not approved"}</dd>
          </div>
          <div>
            <dt>Approval recorded</dt>
            <dd>
              {c.approval
                ? `${date(c.approval.timestamp)} · Plan v${c.approval.planVersion}`
                : "Not approved"}
            </dd>
          </div>
          <div>
            <dt>Classification</dt>
            <dd>
              {c.classification?.mode === "live"
                ? `Live AI · ${c.classification.model}`
                : "Scripted fallback"}
            </dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>
              {c.verification
                ? date(c.verification.timestamp)
                : "Not performed"}
            </dd>
          </div>
        </dl>
        <h2>Declared scope</h2>
        <p>
          {c.findings.length} findings across Slack, Gmail, Salesforce, Notion,
          and Google Drive. All identities, source records, policies, and
          connector operations are simulated. No external company accounts were
          accessed.
        </p>
        <h2>Actions and results</h2>
        <table>
          <thead>
            <tr>
              <th>Record reference</th>
              <th>System</th>
              <th>Action</th>
              <th>Execution</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {report.actions.map((action) => (
              <tr key={action.recordId}>
                <td>{action.recordId}</td>
                <td>{platformNames[action.platform as Platform]}</td>
                <td>{action.action}</td>
                <td>
                  {c.results.find((r) => r.findingId === action.recordId)
                    ?.status ?? "Not executed"}
                </td>
                <td>
                  {!c.verification
                    ? "Not checked"
                    : c.verification.unresolved.some(
                          (u) => u.recordId === action.recordId,
                        )
                      ? "Unresolved"
                      : "Accounted for"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.verification && (
          <>
            <h2>Verification evidence</h2>
            <p>
              Direct reads and a fresh search across{" "}
              {c.verification.platformsChecked.length} simulated systems found{" "}
              {c.verification.removed.length} removed or redacted records,{" "}
              {c.verification.retained.length} retained records,{" "}
              {c.verification.dismissed.length} reviewed false positives, and{" "}
              {c.verification.unresolved.length} unresolved findings.
            </p>
            {c.verification.unresolved.length > 0 && (
              <ul>
                {c.verification.unresolved.map((item) => (
                  <li key={item.recordId}>
                    <strong>{item.recordId}:</strong> {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <h2>Retention decisions</h2>
        {report.retentionPolicies.map((policy) => (
          <p key={policy.id}>
            <strong>
              {policy.name} ({policy.id}):
            </strong>{" "}
            {policy.reason} {policy.legalBasis} Review date: {policy.reviewDate}
            .
          </p>
        ))}
        {report.actions
          .filter((a) => a.action === "retain" && !a.policyId)
          .map((a) => (
            <p key={a.recordId}>
              <strong>{a.recordId}:</strong> {a.reviewerReason ?? a.rationale}
            </p>
          ))}
        <h2>Traceability</h2>
        <p>
          {c.audit.length} recorded events link discovery, policy checks,
          proposals, human decisions, connector outcomes, and verification.
          Download the accompanying JSON for the full audit metadata, approval
          hash, source hashes, and per-record rationale. The export excludes
          source document bodies and redaction text.
        </p>
        <h2>Timing and legal context</h2>
        <p>
          The displayed response deadline is one calendar month from receipt.
          GDPR permits certain justified exceptions and extensions; those
          require company assessment and timely communication. This demo does
          not determine legal eligibility, send a response to the requester, or
          notify downstream recipients.
        </p>
        <div className="report-limitations">
          <strong>Limits of this evidence</strong>
          <ul>
            {report.limitations.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
          <p>
            GDPR reference:
            edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en
          </p>
        </div>
      </article>
    </div>
  );
}
