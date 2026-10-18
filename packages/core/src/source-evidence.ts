import { digest, readLines, sourcePath } from './source-reader.js';
import { evidenceId, logEvidence } from './evidence.js';
import type { CodeEvidence, CodeRange, LogEvidence } from './evidence.js';
import { limits, positiveInteger } from './limits.js';
import { parseLogEvent } from './log-reader.js';
import { redactEvent, redactText } from './redact.js';

export async function readCodeEvidence(
  root: string,
  range: CodeRange,
  signal?: AbortSignal,
): Promise<CodeEvidence> {
  positiveInteger(range.start, 'code start');
  positiveInteger(range.end, 'code end');
  if (
    range.end < range.start ||
    range.end - range.start >= limits.codeLines ||
    range.end > limits.inputLines
  )
    throw new Error(
      `Code range must contain 1–${limits.codeLines} lines within the source line budget`,
    );
  const source = await sourcePath(root, range.file);
  const lines: string[] = [];
  await readLines(
    source.absolute,
    {
      maxBytes: limits.codeBytes,
      maxLineBytes: limits.codeLineBytes,
      ...(signal ? { signal } : {}),
    },
    ({ number, text }) => {
      if (number >= range.start && number <= range.end) {
        if (text === null) throw new Error(`Code line too long: ${source.path}:${number}`);
        lines.push(text);
      }
      if (number >= range.end) return false;
    },
  );
  if (lines.length !== range.end - range.start + 1)
    throw new Error(`Code range unavailable: ${source.path}:${range.start}-${range.end}`);
  const original = lines.join('\n');
  const reference = { path: source.path, line: range.start, sha256: digest(original) };
  return {
    kind: 'code',
    id: evidenceId('code', reference),
    source: reference,
    endLine: range.end,
    text: redactText(original),
  };
}

/** Explicit citations may refer to counterevidence outside the correlated timeline. */
export async function readLogEvidence(
  root: string,
  file: string,
  line: number,
): Promise<LogEvidence> {
  positiveInteger(line, 'log line');
  if (line > limits.inputLines) throw new Error('Log citation exceeds the source line budget');
  const source = await sourcePath(root, file);
  let evidence: LogEvidence | undefined;
  await readLines(
    source.absolute,
    { maxBytes: limits.logBytes, maxLineBytes: limits.logLineBytes },
    ({ number, text }) => {
      if (number !== line) return;
      if (text === null) throw new Error(`Log line too long: ${source.path}:${line}`);
      const parsed = parseLogEvent(text);
      if (!parsed.success)
        throw new Error(`Invalid cited log at ${source.path}:${line}: ${parsed.reason}`);
      evidence = logEvidence(source.path, line, text, redactEvent(parsed.event));
      return false;
    },
  );
  if (!evidence) throw new Error(`Log citation unavailable: ${source.path}:${line}`);
  return evidence;
}
