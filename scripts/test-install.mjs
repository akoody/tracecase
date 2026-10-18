import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 20)) {
  throw new Error(
    'The tested Skills CLI 1.7.2 requires Node.js 22.20+. Tracecase runtime supports 20.19+.',
  );
}
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'tracecase-install-'));
const source = join(temporary, 'release source', 'tracecase');
const environments = [];
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
  DISABLE_TELEMETRY: '1',
  DO_NOT_TRACK: '1',
  NO_COLOR: '1',
};

try {
  await cp(join(root, 'skills/tracecase'), source, { recursive: true });
  const expectedRuntime = await readFile(join(source, 'scripts/tracecase.mjs'));
  for (const mode of ['default', 'copy']) {
    const cwd = join(temporary, `project ${mode}`);
    await mkdir(cwd);
    const installed = await exec(
      'npx',
      [
        '--yes',
        'skills@1.7.2',
        'add',
        source,
        '--agent',
        'codex',
        '--yes',
        ...(mode === 'copy' ? ['--copy'] : []),
      ],
      { cwd, env, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const skill = join(cwd, '.agents/skills/tracecase');
    assert.deepEqual(await readFile(join(skill, 'scripts/tracecase.mjs')), expectedRuntime);
    assert.match(
      await readFile(join(skill, 'scripts/THIRD_PARTY_NOTICES.txt'), 'utf8'),
      /MIT License/,
    );
    environments.push({ cwd, skill, mode });
    console.log(
      JSON.stringify({
        mode,
        installed: true,
        installer: 'skills@1.7.2',
        output: installed.stdout.includes('tracecase'),
      }),
    );
  }
  // An installed skill must not need its original source or development dependencies.
  await rm(join(temporary, 'release source'), { recursive: true });
  for (const { cwd, skill, mode } of environments) {
    const cli = join(skill, 'scripts/tracecase.mjs');
    const run = (args) => exec(process.execPath, [cli, ...args], { cwd, env, timeout: 10_000 });
    const event = {
      timestamp: '2026-01-01T00:00:00Z',
      level: 'error',
      service: 'worker',
      event: 'timeout',
      orderId: 'ord_install',
    };
    await writeFile(join(cwd, 'events.jsonl'), `${JSON.stringify(event)}\n`);
    await run([
      'collect',
      '--root',
      '.',
      '--log',
      'events.jsonl',
      '--order',
      'ord_install',
      '--out',
      'evidence.json',
    ]);
    const bundle = JSON.parse(await readFile(join(cwd, 'evidence.json'), 'utf8'));
    assert.equal(bundle.evidence.length, 1);
    const id = bundle.evidence[0].id;
    const report = {
      schemaVersion: 1,
      title: 'Installed skill smoke test',
      symptom: 'Worker timeout',
      conclusion: {
        status: 'insufficient',
        summary: 'Provider outcome is unknown.',
        evidenceIds: [id],
      },
      findings: [{ statement: 'Worker timeout was recorded.', evidenceIds: [id] }],
      hypotheses: [
        {
          statement: 'The operation committed before timeout.',
          outcome: 'untested',
          reasoning: 'Provider ledger is unavailable.',
          evidenceIds: [],
        },
      ],
      missingData: ['Provider ledger'],
      reproduction: [],
      proposedFix: [],
      verification: [],
    };
    await writeFile(join(cwd, 'report.json'), JSON.stringify(report));
    const verified = await run(['verify', '--root', '.', '--bundle', 'evidence.json']);
    assert.equal(JSON.parse(verified.stdout).valid, true);
    await run([
      'report',
      '--bundle',
      'evidence.json',
      '--input',
      'report.json',
      '--out',
      'investigation.md',
    ]);
    assert.match(await readFile(join(cwd, 'investigation.md'), 'utf8'), /Conclusion: insufficient/);
    console.log(
      JSON.stringify({ mode, collect: true, verify: true, report: true, sourceRemoved: true }),
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
