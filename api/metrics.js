// /api/metrics.js
import { Pool } from 'pg';

// Reaproveita o pool entre chamadas (importante em serverless)
if (!globalThis.pgPool) {
  globalThis.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // necessário para Neon
  });
}
const pool = globalThis.pgPool;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const client = await pool.connect();

  try {
    const now = new Date();

    // Início do dia de hoje
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Últimos 7 dias
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ========= VISITANTES ATIVOS (últimos 5 minutos) =========
    const visitorsNowResult = await client.query(
      `
        SELECT COUNT(DISTINCT session_id) AS c
        FROM events
        WHERE type = 'visit'
          AND created_at >= NOW() - INTERVAL '5 minutes'
      `
    );
    const visitorsNow = Number(visitorsNowResult.rows[0]?.c || 0);

    // ========= PIX GERADO (CHECKOUTS INICIADOS) HOJE =========
    const pixGeneratedTodayResult = await client.query(
      `
        SELECT COUNT(*) AS c
        FROM events
        WHERE type = 'pix_generated'
          AND created_at >= $1
      `,
      [todayStart]
    );
    const checkoutsStarted = Number(pixGeneratedTodayResult.rows[0]?.c || 0);

    // ========= VENDAS HOJE (order_paid) =========
    const salesTodayResult = await client.query(
      `
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(value_in_cents), 0) AS total_cents
        FROM events
        WHERE type = 'order_paid'
          AND created_at >= $1
      `,
      [todayStart]
    );
    const ordersToday = Number(salesTodayResult.rows[0]?.orders || 0);
    const salesTodayCents = Number(salesTodayResult.rows[0]?.total_cents || 0);
    const salesTodayBRL = (salesTodayCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    // ========= CARRINHOS ABANDONADOS HOJE =========
    // Aproximação: Pix gerados - Pix pagos
    const abandonedCarts = Math.max(checkoutsStarted - ordersToday, 0);

    // ========= PEDIDOS + RECEITA (últimos 7 dias) =========
    const orders7dResult = await client.query(
      `
        SELECT
          COUNT(*) AS orders,
          COALESCE(SUM(value_in_cents), 0) AS total_cents
        FROM events
        WHERE type = 'order_paid'
          AND created_at >= $1
      `,
      [sevenDaysAgo]
    );
    const orders7d = Number(orders7dResult.rows[0]?.orders || 0);
    const revenue7dCents = Number(orders7dResult.rows[0]?.total_cents || 0);
    const revenue7dBRL = (revenue7dCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    // ========= PIX GERADO / PAGO (últimos 7 dias) =========
    const pixGenerated7dResult = await client.query(
      `
        SELECT COUNT(*) AS c
        FROM events
        WHERE type = 'pix_generated'
          AND created_at >= $1
      `,
      [sevenDaysAgo]
    );
    const pixGenerated7d = Number(pixGenerated7dResult.rows[0]?.c || 0);

    const pixPaid7dResult = await client.query(
      `
        SELECT COUNT(*) AS c
        FROM events
        WHERE type = 'order_paid'
          AND created_at >= $1
      `,
      [sevenDaysAgo]
    );
    const pixPaid7d = Number(pixPaid7dResult.rows[0]?.c || 0);

    const conversion7d =
      pixGenerated7d > 0
        ? Number(((pixPaid7d / pixGenerated7d) * 100).toFixed(2))
        : 0;

    const pixConversionPercent = conversion7d;

    // ========= COMPORTAMENTO DO CLIENTE (últimos 10 minutos) =========
    const funnelResult = await client.query(
      `
        SELECT type, COUNT(*) AS c
        FROM events
        WHERE created_at >= NOW() - INTERVAL '10 minutes'
          AND type IN ('visit', 'checkout_started', 'pix_generated', 'order_paid')
        GROUP BY type
      `
    );

    const funnelMap = {};
    for (const row of funnelResult.rows) {
      funnelMap[row.type] = Number(row.c || 0);
    }

    const funnelLast10 = {
      checkoutViews: funnelMap['visit'] || 0,
      personalData: funnelMap['checkout_started'] || 0,
      paymentStep: funnelMap['pix_generated'] || 0,
      purchased: funnelMap['order_paid'] || 0,
    };

    // ========= RESPOSTA FINAL =========
    res.status(200).json({
      visitorsNow,
      checkoutsStarted,
      salesTodayBRL,
      abandonedCarts,
      orders7d,
      revenue7dBRL,
      conversion7d,
      pixConversion: {
        percent: pixConversionPercent,
        generated7d: pixGenerated7d,
        paid7d: pixPaid7d,
      },
      funnelLast10,
    });
  } catch (err) {
    console.error('Error in /api/metrics:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
