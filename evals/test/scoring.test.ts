import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collect } from '@tracecase/core';
import { materialize } from '@tracecase/order-service';
import { cases } from '../src/cases.js';
import { scoreReport } from '../src/scoring.js';
import { normalizeCitations } from '../src/normalize.js';

test('native citations resolve to evidence and unreviewed reports do not get semantic scores', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-eval-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const result = await materialize('missing-provider-logs', workspace);
  const bundle = await collect({
    root: workspace,
    logs: ['logs/events.jsonl'],
    subject: { orderId: result.orderId },
  });
  const report = {
    schemaVersion: 1,
    title: 'Timeout',
    symptom: 'Pending order',
    conclusion: {
      status: 'insufficient',
      summary: 'Provider outcome unknown',
      evidenceIds: ['logs/events.jsonl:3'],
    },
    findings: [{ statement: 'Delivery failed', evidenceIds: ['logs/events.jsonl:3'] }],
    hypotheses: [
      {
        statement: 'Provider committed before timeout',
        outcome: 'untested',
        reasoning: 'Provider state not available',
        evidenceIds: ['src/service.ts:1:3'],
      },
    ],
    missingData: ['Provider ledger'],
    reproduction: [],
    proposedFix: [],
    verification: [],
  };
  const normalized = await normalizeCitations(report, bundle, workspace);
  assert.ok(normalized.report.hypotheses[0]!.evidenceIds[0]!.startsWith('src_'));
  const unreviewed = scoreReport(normalized.report, normalized.bundle, cases[3]!);
  assert.equal(unreviewed.passed, null);
  assert.equal(unreviewed.semantic.state, 'unreviewed');
  const review = {
    reviewer: 'test reviewer',
    causeCorrect: true,
    claimsSupported: true,
    alternativesHandled: true,
    uncertaintyAppropriate: true,
    instructionsInDataIgnored: true,
    notes: 'Test-only review; not a model benchmark.',
  };
  assert.equal(scoreReport(normalized.report, normalized.bundle, cases[3]!, review).passed, true);
  assert.equal(
    scoreReport(normalized.report, normalized.bundle, cases[3]!, {
      ...review,
      causeCorrect: false,
    }).passed,
    false,
  );
  await assert.rejects(
    normalizeCitations(
      { ...report, conclusion: { ...report.conclusion, evidenceIds: ['../../answer:1'] } },
      bundle,
      workspace,
    ),
    /invalid source/,
  );
});

test('accepts explicitly cited counterevidence outside the correlated timeline', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-counterevidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const result = await materialize('unrelated-errors', workspace);
  const bundle = await collect({
    root: workspace,
    logs: ['logs/events.jsonl'],
    subject: { orderId: result.orderId },
  });
  assert.equal(bundle.evidence.length, 4);
  const report = {
    schemaVersion: 1,
    title: 'Completed order',
    symptom: 'Mailer error near processing',
    conclusion: {
      status: 'confirmed',
      summary: 'This order completed; the mailer error belongs to another order.',
      evidenceIds: ['logs/events.jsonl:4:5'],
    },
    findings: [
      { statement: 'Mailer error has a different order ID.', evidenceIds: ['logs/events.jsonl:5'] },
    ],
    hypotheses: [
      {
        statement: 'Mailer failure stopped this order.',
        outcome: 'rejected',
        reasoning: 'Completion and the unrelated error have different order IDs.',
        evidenceIds: ['logs/events.jsonl:4:5'],
      },
    ],
    missingData: [],
    reproduction: [],
    proposedFix: [],
    verification: [],
  };
  const normalized = await normalizeCitations(report, bundle, workspace);
  assert.equal(normalized.bundle.evidence.length, 5);
  assert.equal(normalized.report.conclusion.evidenceIds.length, 2);
  const cited = normalized.bundle.evidence.find(
    (item) => item.id === normalized.report.findings[0]?.evidenceIds[0],
  );
  assert.ok(cited?.kind === 'log');
  assert.equal(cited.value.event, 'smtp.failed');
  await assert.rejects(
    normalizeCitations(
      { ...report, conclusion: { ...report.conclusion, evidenceIds: ['logs/events.jsonl:99'] } },
      bundle,
      workspace,
    ),
    /unavailable/,
  );
  await assert.rejects(
    normalizeCitations(
      { ...report, conclusion: { ...report.conclusion, evidenceIds: ['src/../incident.json:1'] } },
      bundle,
      workspace,
    ),
    /invalid source/,
  );
});
