// api/metrics.js
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const client = await pool.connect();

    try {
      const [
        visitorsActiveResult,
        checkoutsTodayResult,
        ordersPaidTodayResult,
        pixGeneratedTodayResult,
        pixGenerated7dResult,
        pixPaid7dResult,
        revenue7dResult,
        stepsLast10Result
      ] = await Promise.all([
        // Visitantes ativos (últimos 5 minutos) – sessões únicas
        client.query(`
          SELECT COUNT(DISTINCT session_id) AS count
          FROM events
          WHERE created_at >= NOW() - INTERVAL '5 minutes'
        `),

        // Checkouts iniciados hoje
        client.query(`
          SELECT COUNT(*) AS count
          FROM events
          WHERE type = 'checkout'
            AND created_at::date = CURRENT_DATE
        `),

        // Pedidos pagos hoje
        client.query(`
          SELECT COUNT(*) AS count
          FROM events
          WHERE type = 'order_paid'
            AND created_at::date = CURRENT_DATE
        `),

        // Pix gerados hoje (para calcular carrinho abandonado)
        client.query(`
          SELECT COUNT(*) AS count
          FROM events
          WHERE type = 'pix_generated'
            AND created_at::date = CURRENT_DATE
        `),

        // Pix gerados últimos 7 dias
        client.query(`
          SELECT COUNT(*) AS count
          FROM events
          WHERE type = 'pix_generated'
            AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
        `),

        // Pix pagos últimos 7 dias
        client.query(`
          SELECT COUNT(*) AS count
          FROM events
          WHERE type = 'order_paid'
            AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
        `),

        // Receita dos últimos 7 dias (em centavos)
        client.query(`
          SELECT COALESCE(SUM(value_in_cents), 0) AS sum
          FROM events
          WHERE type = 'order_paid'
            AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
        `),

        // Comportamento do cliente (últimos 10 minutos)
        client.query(`
          SELECT type, COUNT(*) AS count
          FROM events
          WHERE created_at >= NOW() - INTERVAL '10 minutes'
            AND type IN ('checkout', 'pix_generated', 'order_paid')
          GROUP BY type
        `)
      ]);

      const num = (v) => Number(v || 0);

      const visitors_active = num(visitorsActiveResult.rows[0]?.count);
      const checkouts_today = num(checkoutsTodayResult.rows[0]?.count);
      const orders_paid_today = num(ordersPaidTodayResult.rows[0]?.count);
      const pix_generated_today = num(pixGeneratedTodayResult.rows[0]?.count);

      const pix_generated_7d = num(pixGenerated7dResult.rows[0]?.count);
      const pix_paid_7d = num(pixPaid7dResult.rows[0]?.count);
      const revenue_7d = num(revenue7dResult.rows[0]?.sum);

      const abandoned_today = Math.max(pix_generated_today - orders_paid_today, 0);

      const pix_conversion =
        pix_generated_7d > 0
          ? Math.round((pix_paid_7d / pix_generated_7d) * 1000) / 10
          : 0;

      // Aqui eu usei a mesma base de conversão (pix gerado → pix pago)
      // Se quiser, depois podemos mudar para outra fórmula.
      const checkout_conversion = pix_conversion;

      const stepsMap = {
        checkout: 0,
        pix_generated: 0,
        order_paid: 0
      };

      for (const row of stepsLast10Result.rows) {
        const t = row.type;
        if (stepsMap[t] !== undefined) {
          stepsMap[t] = num(row.count);
        }
      }

      res.status(200).json({
        visitors_active,
        checkouts_today,
        orders_paid_today,
        abandoned_today,
        pix_generated_7d,
        pix_paid_7d,
        revenue_7d,
        pix_conversion,
        checkout_conversion,
        steps: stepsMap
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro ao gerar métricas:', err);
    res.status(500).json({
      error: 'Erro ao gerar métricas.',
      details: err.message
    });
  }
}
