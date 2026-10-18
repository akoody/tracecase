import type { LogEvent } from '@tracecase/core';
import type { Message, PaymentGateway, Store } from './domain.js';

/** A local simulator. No network access or real money operations. */
export class DemoProvider implements PaymentGateway {
  constructor(
    private readonly store: Store,
    private readonly emit: (event: LogEvent) => void,
    private readonly clock: () => Date,
  ) {}
  async charge(
    message: Message,
    payment: { amount: number; currency: string },
    options: { responseLost?: boolean },
  ): Promise<string> {
    const chargeId = await this.store.recordCharge(
      message.orderId,
      payment.amount,
      payment.currency,
    );
    this.emit({
      timestamp: this.clock().toISOString(),
      level: 'info',
      service: 'provider',
      event: 'charge.committed',
      orderId: message.orderId,
      traceId: message.traceId,
      requestId: message.id,
      data: { chargeId, amount: payment.amount, currency: payment.currency },
    });
    if (options.responseLost) throw new Error('Provider response timed out');
    return chargeId;
  }
}
