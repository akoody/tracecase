import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { collect, verifyBundle } from '../src/index.js';

async function fixture(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-core-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const event = (extra: object = {}): object => ({
  timestamp: '2026-01-01T00:00:00Z',
  level: 'info',
  service: 'worker',
  event: 'job.started',
  ...extra,
});
const jsonl = (...events: object[]): string =>
  `${events.map((value) => JSON.stringify(value)).join('\n')}\n`;

test('correlates reverse-order identifier chains across files and excludes unrelated errors', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'a.jsonl'),
    jsonl(
      event({ requestId: 'r1', timestamp: '2026-01-01T00:00:02+00:00' }),
      event({ traceId: 't1', requestId: 'r1' }),
    ),
  );
  await writeFile(
    join(root, 'b.jsonl'),
    jsonl(event({ orderId: 'o1', traceId: 't1' }), event({ orderId: 'o2', level: 'error' })),
  );
  const bundle = await collect({ root, logs: ['a.jsonl', 'b.jsonl'], subject: { orderId: 'o1' } });
  assert.equal(bundle.evidence.length, 3);
  assert.equal(bundle.collection.complete, true);
  assert.equal(bundle.evidence.at(-1)?.source.line, 1);
  assert.ok((await verifyBundle(bundle, root)).every((item) => item.valid));
});

test('numeric identifier values do not match string identifiers', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'events'), jsonl(event({ orderId: 12 }), event({ orderId: '12' })));
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: '12' } });
  assert.equal(bundle.evidence.length, 1);
  assert.equal(bundle.collection.diagnosticCount, 1);
  assert.equal(bundle.evidence[0]?.source.line, 2);
});

test('reports malformed JSON, invalid dates and unknown top-level fields without echoing raw input', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'events'),
    `secret is not json\n${jsonl(event({ timestamp: 'yesterday' }), event({ orderId: 'o', secret: 'hidden' }), event({ orderId: 'o' }))}`,
  );
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  assert.equal(bundle.collection.diagnosticCount, 3);
  assert.equal(bundle.collection.complete, false);
  assert.equal(bundle.evidence[0]?.source.line, 4);
  assert.ok(!JSON.stringify(bundle).includes('hidden'));
});

test('bounds oversized lines and recovers subsequent valid events', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'events'),
    `${'x'.repeat(150_000)}\n${jsonl(event({ orderId: 'o' }))}`,
  );
  const bundle = await collect({
    root,
    logs: ['events'],
    subject: { orderId: 'o' },
    maxLineBytes: 1024,
  });
  assert.equal(bundle.evidence.length, 1);
  assert.equal(bundle.collection.diagnosticCount, 1);
  assert.equal(bundle.evidence[0]?.source.line, 2);
});

test('byte limit excludes a truncated tail and reports incomplete coverage', async (t) => {
  const root = await fixture(t);
  const first = jsonl(event({ orderId: 'o' }));
  await writeFile(join(root, 'events'), first + first);
  const bundle = await collect({
    root,
    logs: ['events'],
    subject: { orderId: 'o' },
    maxBytes: Buffer.byteLength(first) + 10,
  });
  assert.equal(bundle.evidence.length, 1);
  assert.equal(bundle.collection.complete, false);
  assert.equal(bundle.collection.files[0]?.bytes, Buffer.byteLength(first) + 10);
});

test('output truncation is explicit and chronological', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'events'),
    jsonl(event({ orderId: 'o', timestamp: '2026-01-01T00:00:03Z' }), event({ orderId: 'o' })),
  );
  const bundle = await collect({
    root,
    logs: ['events'],
    subject: { orderId: 'o' },
    maxOutputEvents: 1,
  });
  assert.equal(bundle.collection.omittedEvents, 1);
  assert.equal(bundle.collection.complete, false);
  assert.equal(bundle.evidence[0]?.source.line, 2);
});

test('input event cap reports incompleteness without silently scanning the remainder', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'events'), jsonl(event({ orderId: 'o' }), event({ orderId: 'o' })));
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' }, maxEvents: 1 });
  assert.equal(bundle.collection.validEvents, 1);
  assert.equal(bundle.collection.complete, false);
});

test('redacts nested credentials and bearer tokens but verifies against original lines', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'events'),
    jsonl(
      event({
        orderId: 'o',
        message: 'Bearer sample.token',
        data: { nested: { password: 'secret-value' }, url: 'https://user:pass@example.test' },
      }),
    ),
  );
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  const output = JSON.stringify(bundle);
  assert.ok(!output.includes('secret-value'));
  assert.ok(!output.includes('sample.token'));
  assert.ok(!output.includes('user:pass'));
  assert.equal((await verifyBundle(bundle, root))[0]?.valid, true);
});

test('code citations normalize CRLF and detect changed source lines', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'events'), jsonl(event({ orderId: 'o' })));
  await writeFile(join(root, 'worker.ts'), 'const a = 1;\r\nconst b = 2;\r\n');
  const bundle = await collect({
    root,
    logs: ['events'],
    subject: { orderId: 'o' },
    code: [{ file: 'worker.ts', start: 1, end: 2 }],
  });
  assert.ok((await verifyBundle(bundle, root)).every((item) => item.valid));
  await writeFile(join(root, 'worker.ts'), 'const a = 9;\nconst b = 2;\n');
  assert.equal(
    (await verifyBundle(bundle, root)).find((item) => item.id.startsWith('src_'))?.valid,
    false,
  );
});

test('rejects symlink escapes, missing code ranges, empty subjects and invalid limits', async (t) => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'tracecase-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'events'), jsonl(event({ orderId: 'o' })));
  await symlink(join(outside, 'events'), join(root, 'escape'));
  await assert.rejects(
    collect({ root, logs: ['escape'], subject: { orderId: 'o' } }),
    /inside the root/,
  );
  await writeFile(join(root, 'events'), jsonl(event({ orderId: 'o' })));
  await assert.rejects(collect({ root, logs: ['events'], subject: {} }), /at least one/);
  await assert.rejects(
    collect({ root, logs: ['events'], subject: { orderId: 'o' }, maxBytes: 0 }),
    /positive/,
  );
  await assert.rejects(
    collect({
      root,
      logs: ['events'],
      subject: { orderId: 'o' },
      code: [{ file: 'events', start: 1, end: 3 }],
    }),
    /unavailable/,
  );
});

test('deduplicates identical source files and supports cancellation', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'events'), jsonl(event({ orderId: 'o' })));
  const bundle = await collect({ root, logs: ['events', './events'], subject: { orderId: 'o' } });
  assert.equal(bundle.evidence.length, 1);
  assert.equal(bundle.collection.files.length, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    collect({ root, logs: ['events'], subject: { orderId: 'o' }, signal: controller.signal }),
    /abort/i,
  );
});

test('preserves multibyte UTF-8 split over a stream chunk boundary', async (t) => {
  const root = await fixture(t);
  const prefix =
    '{"timestamp":"2026-01-01T00:00:00Z","level":"info","service":"api","event":"note","orderId":"o","message":"';
  const text = 'a'.repeat(65535 - Buffer.byteLength(prefix)) + 'Ж🙂';
  await writeFile(join(root, 'events'), `${prefix}${text}"}\n`);
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  assert.equal(bundle.evidence[0]?.kind === 'log' && bundle.evidence[0].value.message, text);
});

test('verification rejects a tampered event projection even when original line hash matches', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'events'), jsonl(event({ orderId: 'o' })));
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  const first = bundle.evidence[0]!;
  if (first.kind === 'log') first.value.event = 'charge.committed';
  assert.equal((await verifyBundle(bundle, root))[0]?.valid, false);
});

test('verification accepts reordered JSON object keys while preserving array order', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'events'),
    jsonl(
      event({ orderId: 'o', data: { first: 1, second: { a: true, b: false }, values: [1, 2] } }),
    ),
  );
  const bundle = await collect({ root, logs: ['events'], subject: { orderId: 'o' } });
  const item = bundle.evidence[0];
  assert.ok(item && item.kind === 'log');
  item.value.data = { values: [1, 2], second: { b: false, a: true }, first: 1 };
  assert.equal((await verifyBundle(bundle, root))[0]?.valid, true);
  item.value.data.values = [2, 1];
  assert.equal((await verifyBundle(bundle, root))[0]?.valid, false);
});
