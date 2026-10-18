import { randomUUID } from 'node:crypto';
import type { Json, LogEvent } from '@tracecase/core';
import type { Message, Order, PaymentGateway, Store } from './domain.js';
import { DemoProvider } from './provider.js';

export type Emit = (event: LogEvent) => void;
export type PayloadEncoder = (order: Order) => Record<string, unknown>;
export type PayloadDecoder = (payload: Record<string, unknown>) => {
  amount: number;
  currency: string;
};
export const encodeCurrent: PayloadEncoder = (order) => ({
  amount: order.amount,
  currencyCode: order.currency,
});
export const decodeCurrent: PayloadDecoder = (payload) => {
  if (
    typeof payload.amount !== 'number' ||
    !Number.isSafeInteger(payload.amount) ||
    payload.amount <= 0 ||
    typeof payload.currencyCode !== 'string'
  )
    throw new Error('Invalid charge payload');
  return { amount: payload.amount, currency: payload.currencyCode.toUpperCase() };
};

export class OrderService {
  constructor(
    private readonly store: Store,
    private readonly emit: Emit,
    private readonly encode: PayloadEncoder = encodeCurrent,
    private readonly decode: PayloadDecoder = decodeCurrent,
    private readonly clock: () => Date = () => new Date(),
    private readonly gateway: PaymentGateway = new DemoProvider(store, emit, clock),
  ) {}

  private log(value: Omit<LogEvent, 'timestamp'>): void {
    this.emit({ timestamp: this.clock().toISOString(), ...value });
  }

  async create(order: Order, traceId: string, messageId: string = randomUUID()): Promise<Message> {
    await this.store.createOrder(order);
    const message = { id: messageId, orderId: order.id, traceId, payload: this.encode(order) };
    await this.store.publish(message);
    this.log({
      level: 'info',
      service: 'api',
      event: 'order.created',
      orderId: order.id,
      traceId,
      release: 'api-2.0.0',
      data: { messageId: message.id, payload: message.payload as Record<string, Json> },
    });
    return message;
  }

  /** Deliberately vulnerable worker for the incident laboratory. Never use for actual payments. */
  async deliver(message: Message, options: { responseLost?: boolean } = {}): Promise<boolean> {
    const context = { orderId: message.orderId, traceId: message.traceId, requestId: message.id };
    this.log({
      level: 'info',
      service: 'worker',
      event: 'delivery.started',
      ...context,
      data: { messageId: message.id },
    });
    try {
      const payment = this.decode(message.payload);
      const chargeId = await this.gateway.charge(message, payment, options);
      const order = await this.store.getOrder(message.orderId);
      if (!order) throw new Error('Order not found');
      await this.store.updateOrderStatus(order.id, 'completed');
      this.log({
        level: 'info',
        service: 'worker',
        event: 'order.completed',
        ...context,
        data: { chargeId },
      });
      return true;
    } catch (error) {
      this.log({
        level: 'error',
        service: 'worker',
        event: 'delivery.failed',
        ...context,
        data: { error: error instanceof Error ? error.message : 'Unknown failure' },
      });
      return false;
    }
  }
}
