export const platforms = [
  "slack",
  "gmail",
  "salesforce",
  "notion",
  "drive",
] as const;
export type Platform = (typeof platforms)[number];
export type Action = "delete" | "redact" | "retain" | "dismiss";
export type Stage =
  | "identify"
  | "discover"
  | "classify"
  | "review"
  | "approved"
  | "executed"
  | "verified";

export interface Subject {
  id: string;
  name: string;
  company: string;
  email: string;
  identifiers: { kind: string; value: string; source: string }[];
  searchContext?: { value: string; description: string; source: string }[];
}

export interface ProtectionPolicy {
  id: string;
  name: string;
  reason: string;
  reviewDate: string;
  legalBasis: string;
}

export interface SourceRecord {
  id: string;
  platform: Platform;
  title: string;
  content: string;
  location: string;
  kind: "personal" | "shared";
  subjectId?: string;
  policyId?: string;
  deleted: boolean;
  version: number;
}

export interface RedactionSpan {
  field: "title" | "content";
  start: number;
  end: number;
  text: string;
}

export interface Finding {
  id: string;
  record: SourceRecord;
  sourceHash: string;
  matchedIdentifiers: string[];
  uncertain: boolean;
  contextTerms?: string[];
}

export interface ActionProposal {
  findingId: string;
  action: Action;
  rationale: string;
  spans: RedactionSpan[];
  policyId: string | null;
  needsReview: boolean;
  reviewerReason: string | null;
  origin: "ai" | "scripted" | "policy" | "human";
}

export interface Approval {
  id: string;
  reviewer: string;
  timestamp: string;
  planVersion: number;
  planHash: string;
  sourceHashes: Record<string, string>;
}

export interface ExecutionResult {
  findingId: string;
  action: Action;
  status: "succeeded" | "failed" | "stale";
  timestamp: string;
  message: string;
  attempts: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: "workflow" | "ai" | "policy" | "human" | "connector";
  event: string;
  message: string;
  recordId?: string;
  detail?: Record<string, unknown>;
}

export interface Verification {
  timestamp: string;
  complete: boolean;
  removed: string[];
  retained: string[];
  dismissed: string[];
  unresolved: { recordId: string; reason: string }[];
  platformsChecked: Platform[];
}

export interface ErasureCase {
  id: string;
  revision: number;
  reference: string;
  query: string;
  receivedAt: string;
  deadline: string;
  stage: Stage;
  candidates: Subject[];
  subject: Subject | null;
  identityAttestedAt: string | null;
  findings: Finding[];
  proposals: ActionProposal[];
  planVersion: number;
  approval: Approval | null;
  results: ExecutionResult[];
  verification: Verification | null;
  classification: {
    mode: "live" | "scripted";
    model: string | null;
    reason: string;
  } | null;
  failureInjected: boolean;
  audit: AuditEvent[];
}

export interface AppState {
  activeCase: ErasureCase | null;
  policies: ProtectionPolicy[];
  sources: {
    platform: Platform;
    total: number;
    active: number;
    protected: number;
  }[];
  aiConfigured: boolean;
  fixtureUpdateAvailable: boolean;
}

export const platformNames: Record<Platform, string> = {
  slack: "Slack",
  gmail: "Gmail",
  salesforce: "Salesforce",
  notion: "Notion",
  drive: "Google Drive",
};
