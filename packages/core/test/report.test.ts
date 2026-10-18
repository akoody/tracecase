import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collect, renderReport, validateReport } from '../src/index.js';
import type { InvestigationReport } from '../src/index.js';

test('validates references and renders evidence, hypotheses and collection gaps', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'events'),
    '{"timestamp":"2026-01-01T00:00:00Z","level":"error","service":"worker","event":"timeout","orderId":"o"}\n',
  );
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  const id = bundle.evidence[0]!.id;
  const report: InvestigationReport = {
    schemaVersion: 1,
    title: 'Timeout <script>',
    symptom: 'Pending order',
    conclusion: { status: 'insufficient', summary: 'Provider outcome unknown', evidenceIds: [id] },
    findings: [{ statement: 'Worker timeout', evidenceIds: [id] }],
    hypotheses: [
      {
        statement: 'Provider committed',
        outcome: 'untested',
        reasoning: 'Ledger unavailable',
        evidenceIds: [],
      },
    ],
    missingData: ['Provider ledger'],
    reproduction: ['Not executed'],
    proposedFix: [],
    verification: ['Reconcile provider state'],
  };
  const markdown = renderReport(report, bundle);
  assert.ok(markdown.includes(id));
  assert.ok(markdown.includes('Provider ledger'));
  assert.ok(!markdown.includes('<script>'));
  assert.throws(
    () =>
      validateReport(
        { ...report, conclusion: { ...report.conclusion, evidenceIds: ['invented'] } },
        bundle,
      ),
    /Unknown evidence/,
  );
  assert.throws(() => validateReport({ ...report, missingData: [] }, bundle), /missing data/);
  assert.throws(
    () =>
      validateReport(
        { ...report, conclusion: { ...report.conclusion, status: 'confirmed', evidenceIds: [] } },
        bundle,
      ),
    /requires evidence/,
  );
  assert.throws(
    () =>
      validateReport(
        { ...report, hypotheses: [{ ...report.hypotheses[0], outcome: 'rejected' }] },
        bundle,
      ),
    /require evidence/,
  );
  // Structural validation must never be advertised as a semantic judge.
  assert.doesNotThrow(() =>
    validateReport(
      {
        ...report,
        conclusion: {
          status: 'confirmed',
          summary: 'An unsupported semantic claim',
          evidenceIds: [id],
        },
      },
      bundle,
    ),
  );
});
