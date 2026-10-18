import type { Message, Order, Store } from './domain.js';

export class MemoryStore implements Store {
  private readonly orders = new Map<string, Order>();
  private readonly queue: Message[] = [];
  private readonly queueState = new Map<string, 'processing' | 'completed' | 'failed'>();
  private readonly payments: { id: string; orderId: string; amount: number; currency: string }[] =
    [];
  async createOrder(order: Order): Promise<void> {
    if (this.orders.has(order.id)) throw new Error(`Order already exists: ${order.id}`);
    this.orders.set(order.id, structuredClone(order));
  }
  async updateOrderStatus(id: string, status: Order['status']): Promise<void> {
    const order = this.orders.get(id);
    if (!order) throw new Error(`Order not found: ${id}`);
    this.orders.set(id, { ...order, status });
  }
  async getOrder(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order ? structuredClone(order) : undefined;
  }
  async publish(message: Message): Promise<void> {
    this.queue.push(structuredClone(message));
  }
  async messages(): Promise<Message[]> {
    return structuredClone(this.queue);
  }
  async takeMessage(): Promise<Message | undefined> {
    const message = this.queue.find((item) => !this.queueState.has(item.id));
    if (!message) return undefined;
    this.queueState.set(message.id, 'processing');
    return structuredClone(message);
  }
  async settleMessage(id: string, outcome: 'completed' | 'failed'): Promise<void> {
    this.queueState.set(id, outcome);
  }
  async recordCharge(orderId: string, amount: number, currency: string): Promise<string> {
    const id = `charge_${this.payments.length + 1}`;
    this.payments.push({ id, orderId, amount, currency });
    return id;
  }
  async charges(orderId: string): Promise<{ id: string; amount: number; currency: string }[]> {
    return structuredClone(this.payments.filter((item) => item.orderId === orderId));
  }
  async close(): Promise<void> {}
}
