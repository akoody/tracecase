import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Store } from '../src/domain.js';
import { MemoryStore } from '../src/memory-store.js';
import { PostgresStore } from '../src/postgres-store.js';

interface Adapter {
  name: string;
  open: () => Promise<Store>;
  skip: boolean;
}
const adapters: Adapter[] = [
  { name: 'memory', open: async () => new MemoryStore(), skip: false },
  {
    name: 'postgres',
    open: () => PostgresStore.connect(process.env.TRACECASE_TEST_DATABASE_URL ?? ''),
    skip: !process.env.TRACECASE_TEST_DATABASE_URL,
  },
];
for (const adapter of adapters) {
  test(
    `${adapter.name} implements the order persistence contract`,
    { skip: adapter.skip },
    async (t) => {
      const store = await adapter.open();
      const order = {
        id: `ord_${randomUUID()}`,
        amount: 2500,
        currency: 'EUR',
        status: 'pending' as const,
      };
      try {
        await t.test('creates and reads an order', async () => {
          await store.createOrder(order);
          assert.deepEqual(await store.getOrder(order.id), order);
        });
        await t.test('updates status without changing immutable payment details', async () => {
          await store.updateOrderStatus(order.id, 'completed');
          assert.deepEqual(await store.getOrder(order.id), { ...order, status: 'completed' });
        });
        await t.test('rejects duplicate creation without overwriting the original', async () => {
          await assert.rejects(store.createOrder({ ...order, amount: 9999, currency: 'USD' }));
          assert.deepEqual(await store.getOrder(order.id), { ...order, status: 'completed' });
        });
        await t.test('rejects a status update for a missing order', async () => {
          await assert.rejects(
            store.updateOrderStatus(`ord_${randomUUID()}`, 'completed'),
            /Order not found/,
          );
        });
        await t.test('returned objects cannot mutate stored state', async () => {
          const copy = await store.getOrder(order.id);
          assert.ok(copy);
          copy.amount = 1;
          assert.equal((await store.getOrder(order.id))?.amount, 2500);
        });
      } finally {
        await store.close();
      }
    },
  );
}
