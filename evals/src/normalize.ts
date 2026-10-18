import {
  limits,
  readCodeEvidence,
  readLogEvidence,
  reportSchema,
  validateReport,
} from '@tracecase/core';
import type { EvidenceBundle, InvestigationReport } from '@tracecase/core';

interface Citation {
  path: string;
  start: number;
  end: number;
}
function parseCitation(reference: string): Citation {
  const match = /^((?:src|logs)\/[^:]+):([1-9]\d*)(?::([1-9]\d*))?$/.exec(reference);
  if (!match?.[1] || !match[2] || match[1].split('/').includes('..'))
    throw new Error(`Unknown or invalid source citation: ${reference}`);
  const start = Number(match[2]);
  const end = Number(match[3] ?? match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end < start ||
    end - start >= limits.codeLines
  )
    throw new Error(`Invalid source range: ${reference}`);
  return { path: match[1], start, end };
}

/** Resolve explicit citations against the input snapshot, including counterevidence outside the timeline. */
export async function normalizeCitations(
  input: unknown,
  base: EvidenceBundle,
  root: string,
): Promise<{ report: InvestigationReport; bundle: EvidenceBundle }> {
  const report = reportSchema.parse(input);
  const groups = [report.conclusion, ...report.findings, ...report.hypotheses];
  const references = [...new Set(groups.flatMap((group) => group.evidenceIds))];
  if (references.length > 200) throw new Error('Report exceeds the 200-citation budget');
  const evidence = new Map(base.evidence.map((item) => [item.id, item]));
  let bytes = base.evidence.reduce(
    (total, item) => total + Buffer.byteLength(JSON.stringify(item, null, 2)),
    0,
  );
  const addEvidence = (item: EvidenceBundle['evidence'][number]): void => {
    if (!evidence.has(item.id)) bytes += Buffer.byteLength(JSON.stringify(item, null, 2));
    if (bytes > limits.evidenceBytes) throw new Error('Cited evidence exceeds the excerpt budget');
    evidence.set(item.id, item);
  };
  const resolved = new Map<string, string[]>();
  for (const item of base.evidence) {
    resolved.set(item.id, [item.id]);
    const location = `${item.source.path}:${item.source.line}`;
    if (item.kind === 'log' || item.endLine === item.source.line) resolved.set(location, [item.id]);
    if (item.kind === 'code') resolved.set(`${location}:${item.endLine}`, [item.id]);
  }
  for (const reference of references) {
    if (resolved.has(reference)) continue;
    const citation = parseCitation(reference);
    const ids: string[] = [];
    if (citation.path.startsWith('logs/')) {
      for (let line = citation.start; line <= citation.end; line++) {
        const item = await readLogEvidence(root, citation.path, line);
        addEvidence(item);
        ids.push(item.id);
      }
    } else {
      const item = await readCodeEvidence(root, {
        file: citation.path,
        start: citation.start,
        end: citation.end,
      });
      addEvidence(item);
      ids.push(item.id);
    }
    resolved.set(reference, ids);
  }
  for (const group of groups)
    group.evidenceIds = [
      ...new Set(
        group.evidenceIds.flatMap((reference) => {
          const ids = resolved.get(reference);
          if (!ids) throw new Error(`Unresolved citation: ${reference}`);
          return ids;
        }),
      ),
    ];
  const bundle = { ...base, evidence: [...evidence.values()] };
  return { report: validateReport(report, bundle), bundle };
}
