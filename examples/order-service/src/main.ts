import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materialize } from './export-scenario.js';
import { MemoryStore } from './memory-store.js';
import { PostgresStore } from './postgres-store.js';
import { parseScenario } from './scenario-definitions.js';

async function main(): Promise<void> {
  const [name, output, storage = 'memory'] = process.argv.slice(2);
  const scenario = parseScenario(name);
  if (!output || !['memory', 'postgres'].includes(storage))
    throw new Error('Usage: pnpm demo SCENARIO NEW_OUTPUT_DIRECTORY [memory|postgres]');
  const store =
    storage === 'postgres'
      ? await PostgresStore.connect(
          process.env.TRACECASE_DATABASE_URL ??
            'postgres://tracecase:tracecase@127.0.0.1:55432/tracecase',
        )
      : new MemoryStore();
  try {
    await mkdir(resolve(output, '..'), { recursive: true });
    const result = await materialize(scenario, resolve(output), store);
    console.log(
      JSON.stringify({
        output: resolve(output),
        orderId: result.orderId,
        observedState: result.state,
        storage,
      }),
    );
  } finally {
    await store.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Scenario failed');
  process.exitCode = 1;
});
