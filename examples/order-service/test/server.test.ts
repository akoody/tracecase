import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { MemoryStore } from '../src/memory-store.js';
import { createOrderServer } from '../src/server.js';
import { OrderWorker } from '../src/worker.js';

test('HTTP creates and reads an order and rejects invalid input', async (t) => {
  const store = new MemoryStore();
  const server = createOrderServer(store);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const created = await fetch(`${base}/orders`, {
    method: 'POST',
    body: JSON.stringify({ amount: 2500, currency: 'EUR' }),
  });
  assert.equal(created.status, 202);
  const order = (await created.json()) as { id: string; status: string };
  assert.equal(order.status, 'pending');
  assert.equal(await new OrderWorker(store, () => {}).processNext(), true);
  assert.equal(await new OrderWorker(store, () => {}).processNext(), false);
  const fetched = await fetch(`${base}/orders/${order.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(((await fetched.json()) as { status: string }).status, 'completed');
  assert.equal((await fetch(`${base}/orders`, { method: 'POST', body: '{' })).status, 400);
  assert.equal(
    (await fetch(`${base}/orders`, { method: 'POST', body: '{"amount":-1,"currency":"EUR"}' }))
      .status,
    400,
  );
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
