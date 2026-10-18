import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scoreRun } from '../src/score.js';

test('rejects malformed run metadata before accessing the workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-run-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'run.json'),
    JSON.stringify({ caseId: 'c01', mode: 'unknown', workspace: '../outside', snapshot: {} }),
  );
  await assert.rejects(
    scoreRun({ runDirectory: root, report: join(root, 'unused.json') }),
    /Workspace must be an absolute path|Invalid enum/,
  );
});
