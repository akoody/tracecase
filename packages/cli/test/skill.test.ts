import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('packaged skill runs independently with spaces in its installation path', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skill = join(root, 'installed skill');
  await cp(resolve('skills/tracecase'), skill, { recursive: true });
  const cli = join(skill, 'scripts/tracecase.mjs');
  const run = (args: string[]) =>
    exec(process.execPath, [cli, ...args], { cwd: root, timeout: 10_000 });
  assert.match((await run(['--help'])).stdout, /evidence collection/);
  await writeFile(
    join(root, 'events.jsonl'),
    '{"timestamp":"2026-01-01T00:00:00Z","level":"info","service":"api","event":"created","orderId":"o"}\n',
  );
  await run([
    'collect',
    '--root',
    '.',
    '--log',
    'events.jsonl',
    '--order',
    'o',
    '--out',
    'evidence.json',
  ]);
  const verified = await run(['verify', '--root', '.', '--bundle', 'evidence.json']);
  assert.equal(JSON.parse(verified.stdout).valid, true);
  assert.ok((await readFile(join(root, 'evidence.json'), 'utf8')).includes('ev_'));
  await writeFile(join(root, 'events.jsonl'), '\n');
  await assert.rejects(
    run(['verify', '--root', '.', '--bundle', 'evidence.json']),
    (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      return failure.code === 1 && JSON.parse(failure.stdout).valid === false;
    },
  );
});
