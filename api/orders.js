// api/orders.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await pool.connect();

    // Agrupa eventos por order_id para montar os pedidos
    const query = `
      WITH order_events AS (
        SELECT
          order_id,
          MIN(created_at) AS created_at,
          MAX(value_in_cents) FILTER (
            WHERE type IN ('pix_generated', 'order_paid')
          ) AS value_in_cents,
          BOOL_OR(type = 'order_paid') AS paid,
          BOOL_OR(type = 'pix_generated') AS pix_generated
        FROM events
        WHERE order_id IS NOT NULL
        GROUP BY order_id
      )
      SELECT
        order_id,
        created_at,
        COALESCE(value_in_cents, 0) AS value_in_cents,
        CASE
          WHEN paid THEN 'paid'
          WHEN pix_generated THEN 'pending'
          ELSE 'started'
        END AS status
      FROM order_events
      ORDER BY created_at DESC
      LIMIT 300;
    `;

    const { rows } = await client.query(query);
    client.release();

    return res.status(200).json({ orders: rows });
  } catch (err) {
    console.error('Erro ao carregar pedidos:', err);
    return res
      .status(500)
      .json({ error: 'Erro ao carregar pedidos.', details: String(err.message || err) });
  }
}
