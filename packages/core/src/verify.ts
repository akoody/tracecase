import { isDeepStrictEqual } from 'node:util';
import { bundleSchema, eventSchema } from './schema.js';
import type { EvidenceBundle } from './schema.js';
import { digest, readLines, sourcePath } from './source-reader.js';
import { evidenceId } from './evidence.js';
import { limits } from './limits.js';
import { redactEvent, redactText } from './redact.js';

/** Verify source fingerprints and the redacted projection without depending on JSON key order. */
export async function verifyBundle(
  bundle: EvidenceBundle,
  root: string,
): Promise<{ id: string; valid: boolean; reason?: string }[]> {
  bundle = bundleSchema.parse(bundle);
  const groups = new Map<string, typeof bundle.evidence>();
  for (const item of bundle.evidence) {
    const group = groups.get(item.source.path);
    if (group) group.push(item);
    else groups.set(item.source.path, [item]);
  }
  const results: { id: string; valid: boolean; reason?: string }[] = [];
  for (const [file, items] of groups) {
    try {
      const path = await sourcePath(root, file);
      const wanted = new Set<number>();
      for (const item of items)
        for (
          let n = item.source.line;
          n <= (item.kind === 'code' ? item.endLine : item.source.line);
          n++
        )
          wanted.add(n);
      const lines = new Map<number, string>();
      const last = [...wanted].reduce((maximum, line) => Math.max(maximum, line), 0);
      await readLines(
        path.absolute,
        { maxBytes: limits.logBytes, maxLineBytes: limits.logLineBytes },
        ({ number, text }) => {
          if (wanted.has(number) && text !== null) lines.set(number, text);
          if (number >= last) return false;
        },
      );
      for (const item of items) {
        const values: string[] = [];
        for (
          let n = item.source.line;
          n <= (item.kind === 'code' ? item.endLine : item.source.line);
          n++
        ) {
          const value = lines.get(n);
          if (value !== undefined) values.push(value);
        }
        const expectedCount = item.kind === 'code' ? item.endLine - item.source.line + 1 : 1;
        const original = values.join('\n');
        let projectionMatches = false;
        if (item.kind === 'code') projectionMatches = redactText(original) === item.text;
        else {
          try {
            projectionMatches = isDeepStrictEqual(
              redactEvent(eventSchema.parse(JSON.parse(original))),
              item.value,
            );
          } catch {
            projectionMatches = false;
          }
        }
        const expectedId = evidenceId(item.kind, item.source);
        const valid =
          values.length === expectedCount &&
          digest(original) === item.source.sha256 &&
          expectedId === item.id &&
          projectionMatches;
        results.push({
          id: item.id,
          valid,
          ...(!valid
            ? {
                reason:
                  'Source or projection changed, unavailable, oversized, or outside verification budget',
              }
            : {}),
        });
      }
    } catch {
      for (const item of items)
        results.push({ id: item.id, valid: false, reason: 'Source unavailable or outside root' });
    }
  }
  return results;
}
