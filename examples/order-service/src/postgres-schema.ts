import type { Pool } from 'pg';

export async function initializeDemoSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Coordinate first-use initialization across the demo server and parallel test processes.
    await client.query('SELECT pg_advisory_xact_lock(741285014)');
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS tracecase_demo;
      CREATE TABLE IF NOT EXISTS tracecase_demo.orders (
        id text PRIMARY KEY,
        amount integer NOT NULL CHECK (amount > 0),
        currency text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tracecase_demo.messages (
        id text PRIMARY KEY,
        order_id text NOT NULL REFERENCES tracecase_demo.orders(id),
        trace_id text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS tracecase_demo.charges (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id text NOT NULL REFERENCES tracecase_demo.orders(id),
        amount integer NOT NULL,
        currency text NOT NULL
      );
      ALTER TABLE tracecase_demo.messages ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'pending';
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
