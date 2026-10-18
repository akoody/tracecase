import { Pool } from 'pg';
import type { Message, Order, Store } from './domain.js';
import { initializeDemoSchema } from './postgres-schema.js';

/** Demo tables live in a dedicated schema. Initialization never drops user data. */
export class PostgresStore implements Store {
  private constructor(private readonly pool: Pool) {}
  static async connect(url: string): Promise<PostgresStore> {
    const pool = new Pool({
      connectionString: url,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    try {
      await initializeDemoSchema(pool);
      return new PostgresStore(pool);
    } catch (error) {
      await pool.end();
      throw error;
    }
  }
  async createOrder(order: Order): Promise<void> {
    await this.pool.query(
      'INSERT INTO tracecase_demo.orders (id, amount, currency, status) VALUES ($1,$2,$3,$4)',
      [order.id, order.amount, order.currency, order.status],
    );
  }
  async updateOrderStatus(id: string, status: Order['status']): Promise<void> {
    const result = await this.pool.query('UPDATE tracecase_demo.orders SET status=$2 WHERE id=$1', [
      id,
      status,
    ]);
    if (result.rowCount !== 1) throw new Error(`Order not found: ${id}`);
  }
  async getOrder(id: string): Promise<Order | undefined> {
    const result = await this.pool.query<Order>(
      'SELECT id, amount, currency, status FROM tracecase_demo.orders WHERE id=$1',
      [id],
    );
    return result.rows[0];
  }
  async publish(message: Message): Promise<void> {
    await this.pool.query(
      'INSERT INTO tracecase_demo.messages (id,order_id,trace_id,payload) VALUES ($1,$2,$3,$4)',
      [message.id, message.orderId, message.traceId, message.payload],
    );
  }
  async messages(): Promise<Message[]> {
    const result = await this.pool.query<Message>(
      'SELECT id, order_id AS "orderId", trace_id AS "traceId", payload FROM tracecase_demo.messages ORDER BY created_at, id',
    );
    return result.rows;
  }
  async takeMessage(): Promise<Message | undefined> {
    const result = await this.pool.query<Message>(`WITH next AS (
      SELECT id FROM tracecase_demo.messages WHERE state='pending' ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE tracecase_demo.messages AS message SET state='processing' FROM next WHERE message.id=next.id
      RETURNING message.id, order_id AS "orderId", trace_id AS "traceId", payload`);
    return result.rows[0];
  }
  async settleMessage(id: string, outcome: 'completed' | 'failed'): Promise<void> {
    await this.pool.query('UPDATE tracecase_demo.messages SET state=$2 WHERE id=$1', [id, outcome]);
  }
  async recordCharge(orderId: string, amount: number, currency: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      'INSERT INTO tracecase_demo.charges (order_id,amount,currency) VALUES ($1,$2,$3) RETURNING id::text',
      [orderId, amount, currency],
    );
    return `charge_${result.rows[0]!.id}`;
  }
  async charges(orderId: string): Promise<{ id: string; amount: number; currency: string }[]> {
    return (
      await this.pool.query<{ id: string; amount: number; currency: string }>(
        `SELECT 'charge_' || id AS id, amount, currency FROM tracecase_demo.charges WHERE order_id=$1 ORDER BY id`,
        [orderId],
      )
    ).rows;
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
