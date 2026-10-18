import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { Store } from './domain.js';
import { MemoryStore } from './memory-store.js';
import { PostgresStore } from './postgres-store.js';
import { OrderService } from './service.js';
import { OrderWorker } from './worker.js';

export function createOrderServer(store: Store): ReturnType<typeof createServer> {
  const service = new OrderService(store, (event) => console.log(JSON.stringify(event)));
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    try {
      if (request.method === 'GET' && request.url === '/health') {
        response.end('{"status":"ok"}');
        return;
      }
      if (request.method === 'POST' && request.url === '/orders') {
        let body = '';
        let bytes = 0;
        for await (const chunk of request) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
          bytes += buffer.length;
          if (bytes > 4096) {
            response.writeHead(413);
            response.end('{"error":"Body too large"}');
            return;
          }
          body += buffer.toString('utf8');
        }
        let input: unknown;
        try {
          input = JSON.parse(body);
        } catch {
          response.writeHead(400);
          response.end('{"error":"Invalid JSON"}');
          return;
        }
        if (
          !input ||
          typeof input !== 'object' ||
          !('amount' in input) ||
          !Number.isSafeInteger(input.amount) ||
          (input.amount as number) <= 0 ||
          (input.amount as number) > 1_000_000 ||
          !('currency' in input) ||
          typeof input.currency !== 'string' ||
          !/^[A-Z]{3}$/.test(input.currency)
        ) {
          response.writeHead(400);
          response.end('{"error":"Expected amount in minor units and a three-letter currency"}');
          return;
        }
        const id = `ord_${randomUUID()}`;
        await service.create(
          { id, amount: input.amount as number, currency: input.currency, status: 'pending' },
          randomUUID(),
        );
        response.writeHead(202);
        response.end(JSON.stringify(await store.getOrder(id)));
        return;
      }
      const match = request.url && /^\/orders\/(ord_[a-zA-Z0-9_-]+)$/.exec(request.url);
      if (request.method === 'GET' && match) {
        const order = await store.getOrder(match[1]!);
        response.writeHead(order ? 200 : 404);
        response.end(JSON.stringify(order ?? { error: 'Not found' }));
        return;
      }
      response.writeHead(404);
      response.end('{"error":"Not found"}');
    } catch {
      response.writeHead(500);
      response.end('{"error":"Request failed"}');
    }
  });
}

async function main(): Promise<void> {
  const store = process.env.TRACECASE_DATABASE_URL
    ? await PostgresStore.connect(process.env.TRACECASE_DATABASE_URL)
    : new MemoryStore();
  const server = createOrderServer(store);
  const controller = new AbortController();
  const worker = new OrderWorker(store, (event) => console.log(JSON.stringify(event)));
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.listen(4318, '127.0.0.1', () => console.error('Order demo: http://127.0.0.1:4318'));
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    controller.abort();
    server.close(() => {
      void workerRun.finally(() => store.close());
    });
    server.closeIdleConnections();
  };
  const workerRun = worker.run(controller.signal).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Worker failed');
    process.exitCode = 1;
    stop();
  });
  server.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Server failed');
    process.exitCode = 1;
  });
}
