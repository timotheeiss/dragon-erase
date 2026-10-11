import { createHash } from "node:crypto";
import {
  platforms,
  type ActionProposal,
  type Finding,
  type Platform,
  type RedactionSpan,
  type SourceRecord,
  type Subject,
} from "../types";
import type { Store } from "./store";
import { findSpans } from "../redaction";
import { contextMessageSpans, messageSearchTerms } from "../message-search";
export { findSpans } from "../redaction";

export function contentHash(record: SourceRecord): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export function applySpans(
  record: SourceRecord,
  spans: RedactionSpan[],
): SourceRecord {
  const next = { ...record };
  for (const field of ["title", "content"] as const) {
    for (const span of spans
      .filter((item) => item.field === field)
      .sort((a, b) => b.start - a.start)) {
      if (next[field].slice(span.start, span.end) !== span.text)
        throw new Error("Redaction text no longer matches the source.");
      next[field] =
        next[field].slice(0, span.start) +
        "[redacted]" +
        next[field].slice(span.end);
    }
  }
  return next;
}

export interface Connector {
  platform: Platform;
  discover(subject: Subject): Finding[];
  read(id: string): SourceRecord | null;
  execute(proposal: ActionProposal, subject: Subject): void;
  verify(proposal: ActionProposal, subject: Subject): boolean;
}

export function connectors(store: Store): Connector[] {
  return platforms.map((platform) => ({
    platform,
    discover(subject) {
      return store
        .listRecords()
        .filter((record) => record.platform === platform && !record.deleted)
        .flatMap((record) => {
          const spans = findSpans(record, subject);
          const context = contextMessageSpans(record, subject);
          if (!spans.length && !context.length) return [];
          const uncertain = Boolean(
            record.subjectId && record.subjectId !== subject.id,
          );
          return [
            {
              id: record.id,
              record,
              sourceHash: contentHash(record),
              matchedIdentifiers: [...new Set(spans.map((span) => span.text))],
              uncertain,
              ...(context.length
                ? { contextTerms: messageSearchTerms(subject) }
                : {}),
            },
          ];
        });
    },
    read(id) {
      const record = store.record(id);
      return record?.platform === platform ? record : null;
    },
    execute(proposal, subject) {
      const record = this.read(proposal.findingId);
      if (!record) throw new Error("Source record is not available.");
      // Defense in depth: these checks also run in the workflow's approval/execution gates.
      if (record.policyId && proposal.action !== "retain")
        throw new Error("Protected records cannot be changed or dismissed.");
      if (
        record.subjectId &&
        record.subjectId !== subject.id &&
        proposal.action !== "dismiss"
      )
        throw new Error("This record belongs to a different person.");
      if (proposal.action === "delete") {
        store.putRecord({
          ...record,
          title: "[Deleted]",
          content: "",
          subjectId: undefined,
          deleted: true,
          version: record.version + 1,
        });
      } else if (proposal.action === "redact") {
        if (!proposal.spans.length)
          throw new Error("A redaction requires at least one exact span.");
        store.putRecord({
          ...applySpans(record, proposal.spans),
          version: record.version + 1,
        });
      }
    },
    verify(proposal, subject) {
      const record = this.read(proposal.findingId);
      if (!record) return false; // Missing access is not evidence of deletion.
      if (proposal.action === "delete")
        return (
          record.deleted &&
          record.content === "" &&
          findSpans(record, subject).length === 0
        );
      if (proposal.action === "redact")
        return (
          !record.deleted &&
          findSpans(record, subject).length === 0 &&
          contextMessageSpans(record, subject).length === 0
        );
      return !record.deleted;
    },
  }));
}
