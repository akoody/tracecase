import { resolve } from 'node:path';
import { bundleSchema } from '@tracecase/core';
import { cases } from './cases.js';
import { normalizeCitations } from './normalize.js';
import { checkSnapshot } from './workspace.js';
import { readJson, evaluationRunSchema } from './run-store.js';
import type { EvaluationMode } from './run-store.js';
import { runMetadataSchema, scoreReport } from './scoring.js';
import type { ScoreResult, RunMetadata } from './scoring.js';

export interface ScoreOptions {
  runDirectory: string;
  report: string;
  review?: string;
  metadata?: string;
}
export type ScoredRun = ScoreResult & {
  caseId: string;
  mode: EvaluationMode;
  execution?: RunMetadata;
};

export async function scoreRun(options: ScoreOptions): Promise<ScoredRun> {
  const run = evaluationRunSchema.parse(await readJson(resolve(options.runDirectory, 'run.json')));
  const testCase = cases.find((item) => item.id === run.caseId);
  if (!testCase) throw new Error(`Unknown evaluation case: ${run.caseId}`);
  if (testCase.split !== run.split) throw new Error('Evaluation split does not match its case');
  await checkSnapshot(run.workspace, run.snapshot);
  const bundle = bundleSchema.parse(await readJson(resolve(options.runDirectory, 'evidence.json')));
  const normalized = await normalizeCitations(
    await readJson(options.report),
    bundle,
    run.workspace,
  );
  const result = scoreReport(
    normalized.report,
    normalized.bundle,
    testCase,
    options.review ? await readJson(options.review) : undefined,
  );
  return {
    caseId: run.caseId,
    mode: run.mode,
    ...result,
    ...(options.metadata
      ? { execution: runMetadataSchema.parse(await readJson(options.metadata)) }
      : {}),
  };
}
