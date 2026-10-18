import { eventSchema } from './schema.js';
import type { EvidenceBundle, LogEvent } from './schema.js';
import { readLines, sourcePath } from './source-reader.js';
import { logEvidence } from './evidence.js';
import type { LogEvidence } from './evidence.js';
import { limits } from './limits.js';

export type Collection = EvidenceBundle['collection'];
export interface LogReadOptions {
  root: string;
  logs: string[];
  maxBytes: number;
  maxEvents: number;
  maxLineBytes: number;
  signal?: AbortSignal;
}
type ParsedEvent = { success: true; event: LogEvent } | { success: false; reason: string };

function boundedJson(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    if (++nodes > limits.jsonNodes || current.depth > limits.jsonDepth) return false;
    if (current.value !== null && typeof current.value === 'object') {
      for (const item of Object.values(current.value))
        pending.push({ value: item, depth: current.depth + 1 });
    }
  }
  return true;
}

export function parseLogEvent(text: string): ParsedEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { success: false, reason: 'Invalid JSON' };
  }
  if (!boundedJson(raw))
    return {
      success: false,
      reason: `JSON exceeds depth (${limits.jsonDepth}) or node (${limits.jsonNodes.toLocaleString('en-US')}) budget`,
    };
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success)
    return {
      success: false,
      reason: `Invalid event: ${parsed.error.issues.map((issue) => issue.path.join('.') || 'event').join(', ')}`,
    };
  return { success: true, event: parsed.data };
}

export async function readLogs(
  options: LogReadOptions,
): Promise<{ events: LogEvidence[]; collection: Collection }> {
  const collection: Collection = {
    complete: true,
    scannedLines: 0,
    validEvents: 0,
    matchedEvents: 0,
    omittedEvents: 0,
    diagnosticCount: 0,
    diagnostics: [],
    limitations: [],
    files: [],
  };
  const events: LogEvidence[] = [];
  const seenFiles = new Set<string>();
  let totalBytes = 0;
  const diagnostic = (path: string, line: number, reason: string): void => {
    collection.complete = false;
    collection.diagnosticCount++;
    if (collection.diagnostics.length < limits.diagnostics)
      collection.diagnostics.push({ path, line, reason });
  };
  for (const file of options.logs) {
    options.signal?.throwIfAborted();
    const source = await sourcePath(options.root, file);
    if (seenFiles.has(source.path)) continue;
    seenFiles.add(source.path);
    if (
      totalBytes >= options.maxBytes ||
      events.length >= options.maxEvents ||
      collection.scannedLines >= limits.inputLines
    ) {
      collection.complete = false;
      collection.limitations.push(`Collection budget exhausted before reading ${source.path}`);
      continue;
    }
    const result = await readLines(
      source.absolute,
      {
        maxBytes: options.maxBytes - totalBytes,
        maxLineBytes: options.maxLineBytes,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      ({ number, text }) => {
        if (collection.scannedLines >= limits.inputLines) {
          collection.limitations.push(
            `Total input line limit (${limits.inputLines.toLocaleString('en-US')}) reached`,
          );
          return false;
        }
        collection.scannedLines++;
        if (text === null) {
          diagnostic(source.path, number, 'Line exceeds maxLineBytes');
          return;
        }
        if (!text.trim()) return;
        const parsed = parseLogEvent(text);
        if (!parsed.success) {
          diagnostic(source.path, number, parsed.reason);
          return;
        }
        collection.validEvents++;
        events.push(logEvidence(source.path, number, text, parsed.event));
        if (events.length >= options.maxEvents) return false;
      },
    );
    totalBytes += result.bytes;
    collection.files.push({ path: source.path, ...result });
    if (!result.complete) {
      collection.complete = false;
      collection.limitations.push(
        `Incomplete or changing source: ${source.path}; trailing partial line is excluded`,
      );
    }
  }
  return { events, collection };
}
