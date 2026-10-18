import { setTimeout } from 'node:timers/promises';
import type { Store } from './domain.js';
import { OrderService } from './service.js';
import type { Emit } from './service.js';

export class OrderWorker {
  private readonly service: OrderService;
  constructor(
    private readonly store: Store,
    emit: Emit,
  ) {
    this.service = new OrderService(store, emit);
  }
  async processNext(): Promise<boolean> {
    const message = await this.store.takeMessage();
    if (!message) return false;
    const succeeded = await this.service.deliver(message);
    await this.store.settleMessage(message.id, succeeded ? 'completed' : 'failed');
    return true;
  }
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const processed = await this.processNext();
      if (!processed) {
        try {
          await setTimeout(100, undefined, { signal });
        } catch (error) {
          if (!signal.aborted) throw error;
        }
      }
    }
  }
}
