import { digest } from './source-reader.js';
import type { Evidence, LogEvent } from './schema.js';

export type LogEvidence = Extract<Evidence, { kind: 'log' }>;
export type CodeEvidence = Extract<Evidence, { kind: 'code' }>;
export interface CodeRange {
  file: string;
  start: number;
  end: number;
}

export function evidenceId(kind: Evidence['kind'], source: Evidence['source']): string {
  const prefix = kind === 'log' ? 'ev' : 'src';
  return `${prefix}_${digest(`${source.path}:${source.line}:${source.sha256}`).slice(0, 20)}`;
}

export function logEvidence(
  path: string,
  line: number,
  original: string,
  value: LogEvent,
): LogEvidence {
  const source = { path, line, sha256: digest(original) };
  return { kind: 'log', id: evidenceId('log', source), source, value };
}

export function evidenceBytes(evidence: Evidence): number {
  return Buffer.byteLength(JSON.stringify(evidence, null, 2));
}
