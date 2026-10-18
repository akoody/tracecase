import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { checkSnapshot } from '../src/workspace.js';

const exec = promisify(execFile);

test('three conditions share identical incident data and tools run without the source repository', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-conditions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const logs: string[] = [];
  for (const mode of ['baseline', 'skill', 'tools']) {
    const run = join(root, mode);
    await exec(
      process.execPath,
      [resolve('evals/dist/main.js'), 'prepare', '--case', 'c01', '--mode', mode, '--out', run],
      { cwd: root },
    );
    const workspace = join(run, 'workspace');
    logs.push(await readFile(join(workspace, 'logs/events.jsonl'), 'utf8'));
    const names = await readdir(workspace);
    assert.ok(!names.includes('run.json'));
    assert.ok(!names.includes('evidence.json'));
    assert.equal(names.includes('.agents'), mode !== 'baseline');
    assert.ok(!names.includes('.tracecase-tools'));
    if (mode !== 'baseline') {
      const files = await readdir(join(workspace, '.agents/skills/tracecase'));
      assert.equal(files.includes('scripts'), mode === 'tools');
    }
    const metadata = JSON.parse(await readFile(join(run, 'run.json'), 'utf8')) as {
      snapshot: Record<string, string>;
    };
    await checkSnapshot(workspace, metadata.snapshot);
    if (mode === 'tools') {
      const cli = join(workspace, '.agents/skills/tracecase/scripts/tracecase.mjs');
      const output = await exec(
        process.execPath,
        [
          cli,
          'collect',
          '--root',
          '.',
          '--log',
          'logs/events.jsonl',
          '--order',
          'ord_c01',
          '--out',
          'bundle.json',
        ],
        { cwd: workspace },
      );
      assert.equal(JSON.parse(output.stdout).evidence, 3);
      const verified = await exec(
        process.execPath,
        [cli, 'verify', '--root', '.', '--bundle', 'bundle.json'],
        { cwd: workspace },
      );
      assert.equal(JSON.parse(verified.stdout).valid, true);
    }
    await writeFile(join(workspace, 'logs/events.jsonl'), '\n');
    await assert.rejects(checkSnapshot(workspace, metadata.snapshot), /inputs changed/);
  }
  assert.equal(logs[0], logs[1]);
  assert.equal(logs[1], logs[2]);
});
