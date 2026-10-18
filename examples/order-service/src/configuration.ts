import { decodeCurrent, encodeCurrent, OrderService } from './service.js';
import type { Emit } from './service.js';
import { decodeLegacy } from './legacy-decoder.js';
import type { Store } from './domain.js';

export interface ServiceConfiguration {
  decoder: 'current' | 'legacy';
}

export function parseServiceConfiguration(input: unknown): ServiceConfiguration {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('decoder' in input) ||
    (input.decoder !== 'current' && input.decoder !== 'legacy') ||
    Object.keys(input).length !== 1
  ) {
    throw new Error('Service configuration must specify decoder: current or legacy');
  }
  return { decoder: input.decoder };
}

export function createConfiguredService(
  store: Store,
  emit: Emit,
  configuration: ServiceConfiguration,
  clock: () => Date = () => new Date(),
): OrderService {
  const decoder = configuration.decoder === 'legacy' ? decodeLegacy : decodeCurrent;
  return new OrderService(store, emit, encodeCurrent, decoder, clock);
}
