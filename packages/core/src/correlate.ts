import type { LogEvidence } from './evidence.js';
import type { EvidenceBundle, LogEvent } from './schema.js';

const identifierKeys = ['orderId', 'traceId', 'requestId'] as const;
export function identifiers(value: Partial<LogEvent>): string[] {
  return identifierKeys.flatMap((key) => (value[key] ? [`${key}:${value[key]}`] : []));
}

class IdentifierIndex {
  private readonly parents = new Map<string, string>();
  private readonly ranks = new Map<string, number>();

  root(key: string): string {
    let current = key;
    while (this.parents.has(current) && this.parents.get(current) !== current)
      current = this.parents.get(current) ?? current;
    let child = key;
    while (this.parents.has(child) && this.parents.get(child) !== current) {
      const parent = this.parents.get(child) ?? current;
      this.parents.set(child, current);
      child = parent;
    }
    return current;
  }

  link(left: string, right: string): void {
    const a = this.root(left);
    const b = this.root(right);
    if (a === b) return;
    const rankA = this.ranks.get(a) ?? 0;
    const rankB = this.ranks.get(b) ?? 0;
    if (rankA < rankB) this.parents.set(a, b);
    else {
      this.parents.set(b, a);
      if (rankA === rankB) this.ranks.set(a, rankA + 1);
    }
  }
}

export function correlate(
  events: readonly LogEvidence[],
  subject: EvidenceBundle['subject'],
): LogEvidence[] {
  const index = new IdentifierIndex();
  for (const event of events) {
    const keys = identifiers(event.value);
    const first = keys[0];
    if (first) for (const key of keys) index.link(first, key);
  }
  const roots = new Set(identifiers(subject).map((key) => index.root(key)));
  return events
    .filter((event) => identifiers(event.value).some((key) => roots.has(index.root(key))))
    .sort(
      (a, b) =>
        Date.parse(a.value.timestamp) - Date.parse(b.value.timestamp) ||
        a.source.path.localeCompare(b.source.path) ||
        a.source.line - b.source.line,
    );
}
