// /api/metrics.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await pool.connect();

  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1) Visitantes ativos (últimos 5 minutos)
    const visitorsNowResult = await client.query(
      `
      SELECT COUNT(DISTINCT session_id) AS c
      FROM events
      WHERE created_at >= NOW() - INTERVAL '5 minutes'
    `
    );
    const visitorsNow = Number(visitorsNowResult.rows[0]?.c || 0);

    // 2) Checkouts iniciados hoje
    const checkoutsTodayResult = await client.query(
      `
      SELECT COUNT(*) AS c
      FROM events
      WHERE type = 'checkout_started'
        AND created_at >= $1
    `,
      [todayStart]
    );
    const checkoutsStarted = Number(checkoutsTodayResult.rows[0]?.c || 0);

    // 3) Pix gerado hoje
    const pixGeneratedTodayResult = await client.query(
      `
      SELECT COUNT(*) AS c
      FROM events
      WHERE type = 'pix_generated'
        AND created_at >= $1
    `,
      [todayStart]
    );
    const pixGeneratedToday = Number(pixGeneratedTodayResult.rows[0]?.c || 0);

    // 4) Pedidos pagos hoje
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

    // 5) Carrinhos abandonados hoje (aprox = pix gerado - pago)
    const abandonedCarts = Math.max(pixGeneratedToday - ordersToday, 0);

    // 6) Últimos 7 dias – funil + receita
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

    const checkouts7dResult = await client.query(
      `
      SELECT COUNT(*) AS c
      FROM events
      WHERE type = 'pix_generated'
        AND created_at >= $1
    `,
      [sevenDaysAgo]
    );
    const checkouts7d = Number(checkouts7dResult.rows[0]?.c || 0);

    const conversion7d =
      checkouts7d > 0 ? Number(((orders7d / checkouts7d) * 100).toFixed(2)) : 0;

    // 7) Conversão de Pix (últimos 7 dias)
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

    const pixConversionPercent =
      pixGenerated7d > 0
        ? Number(((pixPaid7d / pixGenerated7d) * 100).toFixed(2))
        : 0;

    // 8) COMPORTAMENTO DO CLIENTE – últimos 10 minutos
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
    funnelResult.rows.forEach((r) => {
      funnelMap[r.type] = Number(r.c || 0);
    });

    const funnelLast10 = {
      checkoutViews: funnelMap['visit'] || 0, // acessou o checkout
      personalData: funnelMap['checkout_started'] || 0, // começou a preencher
      paymentStep: funnelMap['pix_generated'] || 0, // chegou na tela do Pix
      purchased: funnelMap['order_paid'] || 0, // pagou
    };

    res.status(200).json({
      visitorsNow,
      checkoutsStarted,
      salesTodayBRL,
      abandonedCarts,
      orders7d,
      revenue7dBRL,
      conversion7d,
      // Conversão de Pix
      pixConversion: {
        percent: pixConversionPercent,
        generated7d: pixGenerated7d,
        paid7d: pixPaid7d,
      },
      // Funil últimos 10 minutos
      funnelLast10,
    });
  } catch (err) {
    console.error('Error in /api/metrics:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
