import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collect, renderReport } from '../src/index.js';

test('source excerpts preserve operators while prose remains escaped', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-render-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'events'), '');
  const code = 'if (amount < minimum && attempts > 0) retry();';
  await writeFile(join(root, 'worker.ts'), code + '\n');
  const bundle = await collect({
    root,
    logs: ['events'],
    subject: { orderId: 'o' },
    code: [{ file: 'worker.ts', start: 1, end: 1 }],
  });
  const id = bundle.evidence[0]?.id;
  assert.ok(id);
  const markdown = renderReport(
    {
      schemaVersion: 1,
      title: 'Inspect <worker>',
      symptom: 'Retry behavior',
      conclusion: {
        status: 'insufficient',
        summary: 'No execution logs supplied.',
        evidenceIds: [id],
      },
      findings: [],
      hypotheses: [
        {
          statement: 'Retry ran.',
          outcome: 'untested',
          reasoning: 'Only source is available.',
          evidenceIds: [],
        },
      ],
      missingData: ['Execution logs'],
      reproduction: [],
      proposedFix: [],
      verification: [],
    },
    bundle,
  );
  assert.ok(markdown.includes(`    ${code}`));
  assert.ok(markdown.includes('Inspect &lt;worker&gt;'));
});
