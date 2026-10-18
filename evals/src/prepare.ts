import { cp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from '@tracecase/core';
import { materialize } from '@tracecase/order-service';
import { cases } from './cases.js';
import { installSkill, snapshot } from './workspace.js';
import { evaluationRunSchema } from './run-store.js';
import type { EvaluationMode } from './run-store.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
export interface PrepareOptions {
  caseId: string;
  mode: EvaluationMode;
  output: string;
}

function prompt(mode: EvaluationMode): string {
  const common =
    'Investigate the incident described in incident.json. Sources are in src/ and logs/. Investigate only this workspace; do not inspect its parent, original Tracecase repository, grading data, or other runs. Do not edit application sources. Write report.json following REPORT_FORMAT.md. Use source locations (path:line or path:start:end) in evidenceIds so all conditions use the same report contract. Do not invent observations. Stop after 20 tool calls or 10 minutes and report remaining uncertainty.';
  const tools =
    mode === 'tools'
      ? 'Use the bundled scripts/tracecase.mjs next to the installed skill to collect evidence. Final report citations must use source locations for shared grading.'
      : 'Tracecase CLI is intentionally excluded from this condition; use native code, file, and shell tools. Do not install or recover it from another location.';
  return [mode === 'baseline' ? '' : 'Use $tracecase.', common, tools].filter(Boolean).join(' ');
}

export async function prepareRun(
  options: PrepareOptions,
): Promise<{ run: string; workspace: string; prompt: string; mode: EvaluationMode; note: string }> {
  const testCase = cases.find((item) => item.id === options.caseId);
  if (!testCase) throw new Error(`Unknown evaluation case: ${options.caseId}`);
  const requested = resolve(options.output);
  const out = join(await realpath(dirname(requested)), basename(requested));
  const root = await realpath(repository);
  const relation = relative(root, out);
  if (
    !relation ||
    (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
  ) {
    throw new Error(
      'Prepare evaluations outside this repository so grading data is not in the workspace',
    );
  }
  await mkdir(out, { recursive: false });
  const workspace = resolve(out, 'workspace');
  const result = await materialize(testCase.scenario, workspace, undefined, `ord_${testCase.id}`);
  if (options.mode !== 'baseline')
    await installSkill(
      workspace,
      options.mode === 'tools',
      resolve(repository, 'skills/tracecase'),
    );
  const bundle = await collect({
    root: workspace,
    logs: ['logs/events.jsonl'],
    subject: { orderId: result.orderId },
  });
  await writeFile(resolve(out, 'evidence.json'), JSON.stringify(bundle, null, 2), { mode: 0o600 });
  const run = evaluationRunSchema.parse({
    caseId: testCase.id,
    mode: options.mode,
    split: testCase.split,
    workspace,
    snapshot: await snapshot(workspace),
  });
  await writeFile(resolve(out, 'run.json'), JSON.stringify(run, null, 2));
  await cp(
    resolve(repository, 'skills/tracecase/references/report.md'),
    resolve(workspace, 'REPORT_FORMAT.md'),
  );
  await writeFile(resolve(workspace, 'PROMPT.txt'), `${prompt(options.mode)}\n`);
  return {
    run: out,
    workspace,
    prompt: resolve(workspace, 'PROMPT.txt'),
    mode: options.mode,
    note: 'Preparation only. No model has run. Enforce workspace isolation externally; instructions alone are not a sandbox.',
  };
}
