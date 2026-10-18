import { bundleSchema } from './schema.js';
import type { Evidence, EvidenceBundle } from './schema.js';
import { correlate, identifiers } from './correlate.js';
import { evidenceBytes } from './evidence.js';
import type { CodeRange } from './evidence.js';
import { limits, positiveInteger } from './limits.js';
import { readLogs } from './log-reader.js';
import { redactEvent } from './redact.js';
import { readCodeEvidence } from './source-evidence.js';

export interface CollectionOptions {
  root: string;
  logs: string[];
  subject: EvidenceBundle['subject'];
  code?: CodeRange[];
  maxBytes?: number;
  maxEvents?: number;
  maxOutputEvents?: number;
  maxLineBytes?: number;
  signal?: AbortSignal;
}

const collectionLimitations = [
  'Completeness applies only to the supplied files, schema and budgets; it does not prove system-wide coverage.',
  'Identifiers are correlated transitively. Reused identifiers can connect unrelated events; inspect the links.',
  'Timestamps may reflect clock skew. Sorted order is not proof of causality.',
  'Redaction is best effort. Review bundles before sharing; personal data may remain.',
];

export async function collect(options: CollectionOptions): Promise<EvidenceBundle> {
  if (!identifiers(options.subject).length)
    throw new Error('Supply at least one orderId, traceId, or requestId');
  if (!options.logs.length || options.logs.length > limits.logFiles)
    throw new Error(`Supply between 1 and ${limits.logFiles} log files`);
  if ((options.code?.length ?? 0) > limits.codeRanges)
    throw new Error(`At most ${limits.codeRanges} code ranges are supported`);
  const maxOutput = positiveInteger(
    options.maxOutputEvents ?? limits.outputEvents,
    'maxOutputEvents',
  );
  const { events, collection } = await readLogs({
    root: options.root,
    logs: options.logs,
    maxBytes: positiveInteger(options.maxBytes ?? limits.logBytes, 'maxBytes'),
    maxEvents: positiveInteger(options.maxEvents ?? limits.logEvents, 'maxEvents'),
    maxLineBytes: positiveInteger(options.maxLineBytes ?? limits.logLineBytes, 'maxLineBytes'),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const matching = correlate(events, options.subject);
  const evidence: Evidence[] = [];
  let bytes = 0;
  for (const event of matching.slice(0, maxOutput)) {
    const projected = { ...event, value: redactEvent(event.value) };
    const size = evidenceBytes(projected);
    if (bytes + size > limits.logEvidenceBytes) break;
    evidence.push(projected);
    bytes += size;
  }
  collection.matchedEvents = matching.length;
  collection.omittedEvents = matching.length - evidence.length;
  if (collection.omittedEvents) {
    collection.complete = false;
    collection.limitations.push(
      `Timeline contains the earliest ${evidence.length} matching events, limited by maxOutputEvents or the 4 MiB log-evidence budget; narrow the subject`,
    );
  }
  const seen = new Set(evidence.map((item) => item.id));
  for (const range of options.code ?? []) {
    const item = await readCodeEvidence(options.root, range, options.signal);
    if (seen.has(item.id)) continue;
    bytes += evidenceBytes(item);
    if (bytes > limits.evidenceBytes)
      throw new Error('Evidence exceeds the 8 MiB excerpt budget; narrow the code ranges');
    evidence.push(item);
    seen.add(item.id);
  }
  collection.limitations.push(...collectionLimitations);
  return bundleSchema.parse({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    subject: options.subject,
    evidence,
    collection,
  });
}
