import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { collect } from '@tracecase/core';
import { materialize, runScenario, scenarios } from '../src/index.js';
import type { Scenario, ScenarioResult } from '../src/index.js';
import { PostgresStore } from '../src/postgres-store.js';
import { MemoryStore } from '../src/memory-store.js';

const expectedOutcomes: Record<Scenario, ScenarioResult['state']> = {
  'contract-drift': { status: 'pending', charges: 0 },
  'duplicate-delivery': { status: 'completed', charges: 2 },
  'lost-response': { status: 'pending', charges: 1 },
  'missing-provider-logs': { status: 'pending', charges: 1 },
  'unrelated-errors': { status: 'completed', charges: 1 },
  'untrusted-log': { status: 'completed', charges: 1 },
  'clock-skew': { status: 'completed', charges: 1 },
  'malformed-log': { status: 'completed', charges: 1 },
  healthy: { status: 'completed', charges: 1 },
  'retry-after-timeout': { status: 'completed', charges: 2 },
};
for (const scenario of scenarios)
  test(`executes ${scenario} and checks actual store state`, async () => {
    const result = await runScenario(scenario);
    const expected = expectedOutcomes[scenario];
    assert.deepEqual(result.state, expected);
    assert.equal(
      result.logs.filter((event) => event.service === 'provider').length,
      scenario === 'missing-provider-logs' ? 0 : expected.charges,
    );
  });

test('materializes real source and logs with no answer or scenario manifest', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tracecase-demo-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const result = await materialize('contract-drift', workspace);
  const configuration = JSON.parse(
    await readFile(join(workspace, 'src/service-config.json'), 'utf8'),
  );
  assert.deepEqual(configuration, { decoder: 'legacy' });
  const exported: typeof import('../src/configuration.js') = await import(
    pathToFileURL(join(workspace, 'src/configuration.ts')).href
  );
  const store = new MemoryStore();
  const service = exported.createConfiguredService(
    store,
    () => {},
    exported.parseServiceConfiguration(configuration),
  );
  const message = await service.create(
    { id: result.orderId, amount: 2500, currency: 'EUR', status: 'pending' },
    'export-trace',
  );
  assert.equal(await service.deliver(message), false);
  assert.deepEqual(
    {
      status: (await store.getOrder(result.orderId))?.status,
      charges: (await store.charges(result.orderId)).length,
    },
    result.state,
  );
  const bundle = await collect({
    root: workspace,
    logs: ['logs/events.jsonl'],
    subject: { orderId: result.orderId },
  });
  assert.equal(bundle.evidence.length, 3);
  assert.ok(
    !JSON.stringify(JSON.parse(await readFile(join(workspace, 'incident.json'), 'utf8'))).includes(
      'contract-drift',
    ),
  );
});

test(
  'postgres adapter persists the same scenario outcomes',
  { skip: !process.env.TRACECASE_TEST_DATABASE_URL },
  async () => {
    const store = await PostgresStore.connect(process.env.TRACECASE_TEST_DATABASE_URL!);
    try {
      for (const scenario of ['contract-drift', 'duplicate-delivery', 'lost-response'] as const) {
        const result = await runScenario(scenario, store);
        assert.equal((await store.getOrder(result.orderId))?.status, result.state.status);
        assert.equal(
          (await store.charges(result.orderId)).length,
          expectedOutcomes[scenario].charges,
        );
      }
    } finally {
      await store.close();
    }
  },
);
