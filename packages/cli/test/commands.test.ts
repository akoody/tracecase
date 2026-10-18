import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run } from '../src/commands.js';

test('CLI commands collect, verify, render, reject overwrites and detect changed input', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = join(root, 'events');
  const bundle = join(root, 'bundle.json');
  await writeFile(
    log,
    '{"timestamp":"2026-01-01T00:00:00Z","level":"info","service":"api","event":"created","orderId":"o"}\n',
  );
  const collect = ['collect', '--root', root, '--log', 'events', '--order', 'o', '--out', bundle];
  const output: string[] = [];
  assert.equal(await run(collect, (text) => output.push(text)), 0);
  assert.equal(JSON.parse(output[0]!).evidence, 1);
  assert.ok((await readFile(bundle, 'utf8')).includes('ev_'));
  await assert.rejects(
    run(collect, () => {}),
    /EEXIST/,
  );
  assert.equal(await run(['verify', '--root', root, '--bundle', bundle], () => {}), 0);
  const id = JSON.parse(await readFile(bundle, 'utf8')).evidence[0].id as string;
  const reportPath = join(root, 'report.json');
  await writeFile(
    reportPath,
    JSON.stringify({
      schemaVersion: 1,
      title: 'Order processing',
      symptom: 'Outcome unknown',
      conclusion: {
        status: 'insufficient',
        summary: 'Only creation is observed',
        evidenceIds: [id],
      },
      findings: [{ statement: 'Order was created', evidenceIds: [id] }],
      hypotheses: [
        {
          statement: 'Processing completed',
          outcome: 'untested',
          reasoning: 'Worker events absent',
          evidenceIds: [],
        },
      ],
      missingData: ['Worker and provider events'],
      reproduction: [],
      proposedFix: [],
      verification: [],
    }),
  );
  const markdown = join(root, 'investigation.md');
  assert.equal(
    await run(['report', '--bundle', bundle, '--input', reportPath, '--out', markdown], () => {}),
    0,
  );
  assert.ok((await readFile(markdown, 'utf8')).includes('Conclusion: insufficient'));
  await assert.rejects(
    run(['report', '--bundle', bundle, '--input', reportPath, '--out', markdown], () => {}),
    /EEXIST/,
  );
  await writeFile(log, '\n');
  assert.equal(await run(['verify', '--root', root, '--bundle', bundle], () => {}), 1);
  await assert.rejects(
    run(['collect', '--max-output=-1', '--out', 'unused'], () => {}),
    /positive/,
  );
  await assert.rejects(
    run(['collect', '--bogus', 'x'], () => {}),
    /Unknown option/,
  );
  await assert.rejects(
    run(['unknown'], () => {}),
    /Unknown command/,
  );
  await assert.rejects(
    run(['constructor'], () => {}),
    /Unknown command/,
  );
});
