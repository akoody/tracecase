import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collect } from '../src/index.js';

test('deeply nested untrusted JSON is skipped and later valid records survive', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-depth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = {
    timestamp: '2026-01-01T00:00:00Z',
    level: 'info',
    service: 'api',
    event: 'note',
    orderId: 'o',
  };
  const deep = `${JSON.stringify(base).slice(0, -1)},"data":{"value":${'['.repeat(10000)}null${']'.repeat(10000)}}}`;
  await writeFile(join(root, 'events'), `${deep}\n${JSON.stringify(base)}\n`);
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  assert.equal(bundle.evidence.length, 1);
  assert.equal(bundle.evidence[0]!.source.line, 2);
  assert.equal(bundle.collection.complete, false);
  assert.match(bundle.collection.diagnostics[0]!.reason, /depth/);
});

test('large matching events cannot produce a bundle too big for downstream JSON readers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const line = JSON.stringify({
    timestamp: '2026-01-01T00:00:00Z',
    level: 'info',
    service: 'api',
    event: 'note',
    orderId: 'o',
    message: 'x'.repeat(240000),
  });
  await writeFile(join(root, 'events'), `${Array.from({ length: 20 }, () => line).join('\n')}\n`);
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  assert.equal(bundle.collection.matchedEvents, 20);
  assert.ok(bundle.collection.omittedEvents > 0);
  assert.equal(bundle.collection.complete, false);
  assert.ok(Buffer.byteLength(JSON.stringify(bundle, null, 2)) < 8 * 1024 * 1024);
});
