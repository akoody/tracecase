import { bundleSchema, reportSchema } from './schema.js';
import type { InvestigationReport } from './schema.js';

export function validateReport(input: unknown, bundleInput: unknown): InvestigationReport {
  const bundle = bundleSchema.parse(bundleInput);
  const report = reportSchema.parse(input);
  const ids = new Set(bundle.evidence.map((item) => item.id));
  if (ids.size !== bundle.evidence.length) throw new Error('Duplicate evidence IDs in bundle');
  const groups = [report.conclusion, ...report.findings, ...report.hypotheses];
  for (const group of groups)
    for (const id of group.evidenceIds) {
      if (!ids.has(id)) throw new Error(`Unknown evidence ID: ${id}`);
    }
  if (report.conclusion.status !== 'insufficient' && !report.conclusion.evidenceIds.length)
    throw new Error('A diagnosis requires evidence');
  if (report.conclusion.status === 'insufficient' && !report.missingData.length)
    throw new Error('An insufficient conclusion must identify missing data');
  for (const hypothesis of report.hypotheses) {
    if (hypothesis.outcome !== 'untested' && !hypothesis.evidenceIds.length)
      throw new Error('Tested hypotheses require evidence');
  }
  return report;
}
