import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Store } from './domain.js';
import { runScenario } from './scenarios.js';
import type { ScenarioResult } from './scenarios.js';
import { scenarioDefinitions } from './scenario-definitions.js';
import type { Scenario } from './scenario-definitions.js';

export async function materialize(
  scenario: Scenario,
  output: string,
  store?: Store,
  orderId?: string,
): Promise<ScenarioResult> {
  await mkdir(output, { recursive: false });
  const definition = scenarioDefinitions[scenario];
  const result = await runScenario(scenario, store, orderId);
  await mkdir(resolve(output, 'logs'));
  await mkdir(resolve(output, 'src'));
  const records = result.logs.map((event) => JSON.stringify(event));
  if (definition.malformedLog) records.splice(1, 0, '{"timestamp":');
  await writeFile(resolve(output, 'logs/events.jsonl'), `${records.join('\n')}\n`, { mode: 0o600 });
  const sourceNames = [
    'service.ts',
    'domain.ts',
    'configuration.ts',
    'legacy-decoder.ts',
    ...(definition.omitProvider ? [] : ['provider.ts']),
  ];
  for (const name of sourceNames) {
    const source = await readFile(new URL(`../src/${name}`, import.meta.url));
    await writeFile(resolve(output, 'src', name), source);
  }
  await writeFile(
    resolve(output, 'src/service-config.json'),
    JSON.stringify(definition.configuration, null, 2) + '\n',
  );
  await writeFile(
    resolve(output, 'incident.json'),
    JSON.stringify(
      {
        orderId: result.orderId,
        symptom:
          'Investigate whether this order was processed correctly. Explain observed failures or inconsistencies with evidence.',
      },
      null,
      2,
    ),
  );
  return result;
}
