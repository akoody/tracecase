export interface Order {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed';
}
export interface Message {
  id: string;
  orderId: string;
  traceId: string;
  payload: Record<string, unknown>;
}
export interface PaymentGateway {
  charge(
    message: Message,
    payment: { amount: number; currency: string },
    options: { responseLost?: boolean },
  ): Promise<string>;
}
export interface Store {
  createOrder(order: Order): Promise<void>;
  updateOrderStatus(id: string, status: Order['status']): Promise<void>;
  getOrder(id: string): Promise<Order | undefined>;
  publish(message: Message): Promise<void>;
  messages(): Promise<Message[]>;
  takeMessage(): Promise<Message | undefined>;
  settleMessage(id: string, outcome: 'completed' | 'failed'): Promise<void>;
  recordCharge(orderId: string, amount: number, currency: string): Promise<string>;
  charges(orderId: string): Promise<{ id: string; amount: number; currency: string }[]>;
  close(): Promise<void>;
}
