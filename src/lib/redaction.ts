import type { RedactionSpan, SourceRecord, Subject } from "./types";

export function findSpans(
  record: SourceRecord,
  subject: Subject,
): RedactionSpan[] {
  const identifiers = [
    ...new Set(subject.identifiers.map((item) => item.value)),
  ].sort((a, b) => b.length - a.length);
  const spans: RedactionSpan[] = [];
  for (const field of ["title", "content"] as const) {
    const lower = record[field].toLocaleLowerCase("en-US");
    for (const identifier of identifiers) {
      const needle = identifier.toLocaleLowerCase("en-US");
      let offset = 0;
      while (offset < lower.length) {
        const start = lower.indexOf(needle, offset);
        if (start === -1) break;
        const end = start + needle.length;
        if (
          !spans.some(
            (span) =>
              span.field === field && start < span.end && end > span.start,
          )
        ) {
          spans.push({
            field,
            start,
            end,
            text: record[field].slice(start, end),
          });
        }
        offset = end;
      }
    }
  }
  return spans.sort(
    (a, b) => a.field.localeCompare(b.field) || a.start - b.start,
  );
}
