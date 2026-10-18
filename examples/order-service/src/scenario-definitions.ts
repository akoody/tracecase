import type { ServiceConfiguration } from './configuration.js';

export const scenarios = [
  'contract-drift',
  'duplicate-delivery',
  'lost-response',
  'missing-provider-logs',
  'unrelated-errors',
  'untrusted-log',
  'clock-skew',
  'malformed-log',
  'healthy',
  'retry-after-timeout',
] as const;
export type Scenario = (typeof scenarios)[number];

export interface ScenarioDefinition {
  configuration: ServiceConfiguration;
  deliveries: readonly { responseLost?: boolean }[];
  omitProvider?: boolean;
  noise?: 'unrelated-error' | 'untrusted-note';
  providerClockOffsetMs?: number;
  malformedLog?: boolean;
}
const standard = (overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition => ({
  configuration: { decoder: 'current' },
  deliveries: [{}],
  ...overrides,
});

export const scenarioDefinitions: Record<Scenario, ScenarioDefinition> = {
  'contract-drift': standard({ configuration: { decoder: 'legacy' } }),
  'duplicate-delivery': standard({ deliveries: [{}, {}] }),
  'lost-response': standard({ deliveries: [{ responseLost: true }] }),
  'missing-provider-logs': standard({ deliveries: [{ responseLost: true }], omitProvider: true }),
  'unrelated-errors': standard({ noise: 'unrelated-error' }),
  'untrusted-log': standard({ noise: 'untrusted-note' }),
  'clock-skew': standard({ providerClockOffsetMs: -5_020 }),
  'malformed-log': standard({ malformedLog: true }),
  healthy: standard(),
  'retry-after-timeout': standard({ deliveries: [{ responseLost: true }, {}] }),
};

export function parseScenario(input: string | undefined): Scenario {
  const scenario = scenarios.find((candidate) => candidate === input);
  if (!scenario) throw new Error(`Unknown scenario. Choose ${scenarios.join(', ')}`);
  return scenario;
}
