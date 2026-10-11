import { findSpans } from "./redaction";
import type { RedactionSpan, SourceRecord, Subject } from "./types";

export function messageSearchTerms(subject: Subject): string[] {
  return [
    subject.company,
    ...(subject.searchContext ?? []).map((fact) => fact.value),
  ];
}

/** Bounded candidate retrieval, not proof that a message refers to the customer. */
export function contextMessageSpans(
  record: SourceRecord,
  subject: Subject,
): RedactionSpan[] {
  if (record.platform !== "slack" || !subject.searchContext?.length) return [];
  const spans: RedactionSpan[] = [];
  let offset = 0;
  for (const line of record.content.split("\n")) {
    const lower = line.toLocaleLowerCase("en-US");
    if (
      lower.includes(subject.company.toLocaleLowerCase("en-US")) &&
      subject.searchContext.some((fact) =>
        lower.includes(fact.value.toLocaleLowerCase("en-US")),
      )
    ) {
      // Keep the employee author; propose removing only the matching message body.
      const prefix = line.match(/^[^:\n]{1,80}:\s*/)?.[0].length ?? 0;
      spans.push({
        field: "content",
        start: offset + prefix,
        end: offset + line.length,
        text: line.slice(prefix),
      });
    }
    offset += line.length + 1;
  }
  return spans;
}

/** Shared by the proposal validator, human preview and deterministic executor. */
export function proposedRedactionSpans(
  record: SourceRecord,
  subject: Subject,
): RedactionSpan[] {
  const context = contextMessageSpans(record, subject);
  const identifiers = findSpans(record, subject).filter(
    (span) =>
      !context.some(
        (message) =>
          message.field === span.field &&
          span.start < message.end &&
          span.end > message.start,
      ),
  );
  return [...context, ...identifiers].sort(
    (a, b) => a.field.localeCompare(b.field) || a.start - b.start,
  );
}
