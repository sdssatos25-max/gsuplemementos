// /api/metrics.js

import pkg from "pg";
const { Pool } = pkg;

// Pool de conexão com o Postgres (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // obrigatório para Neon em ambiente serverless
  },
});

function percentage(part, total) {
  if (!total || total === 0) return 0;
  return Math.round((part / total) * 100);
}

export default async function handler(req, res) {
  let client;
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL não configurado nas variáveis de ambiente.");
    }

    client = await pool.connect();

    // Visitantes ativos - últimos 5 minutos
    const visitors_active = await client.query(
      `
      SELECT COUNT(DISTINCT session_id) AS qty
      FROM events
      WHERE type = 'checkout_view'
        AND created_at > NOW() - INTERVAL '5 minutes'
    `
    );

    // Checkouts iniciados hoje
    const checkouts_today = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'checkout_view'
        AND created_at::date = CURRENT_DATE
    `
    );

    // Pix gerados hoje
    const pix_today = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'pix_generated'
        AND created_at::date = CURRENT_DATE
    `
    );

    // Pedidos pagos hoje
    const paid_today = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'order_paid'
        AND created_at::date = CURRENT_DATE
    `
    );

    // Pix gerados últimos 7 dias
    const pix_generated_7d = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'pix_generated'
        AND created_at > NOW() - INTERVAL '7 days'
    `
    );

    // Pix pagos últimos 7 dias
    const pix_paid_7d = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'order_paid'
        AND created_at > NOW() - INTERVAL '7 days'
    `
    );

    // Receita últimos 7 dias (em centavos)
    const revenue_7d = await client.query(
      `
      SELECT COALESCE(SUM(value_in_cents), 0) AS revenue_cents
      FROM events
      WHERE type = 'order_paid'
        AND created_at > NOW() - INTERVAL '7 days'
    `
    );

    // Comportamento (últimos 10 minutos)
    const stepCheckout = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'checkout_view'
        AND created_at > NOW() - INTERVAL '10 minutes'
    `
    );

    const stepPix = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'pix_generated'
        AND created_at > NOW() - INTERVAL '10 minutes'
    `
    );

    const stepPaid = await client.query(
      `
      SELECT COUNT(*) AS qty
      FROM events
      WHERE type = 'order_paid'
        AND created_at > NOW() - INTERVAL '10 minutes'
    `
    );

    // Normalização dos valores (COUNT sempre vem como string)
    const visitorsActive = Number(visitors_active.rows[0].qty || 0);
    const checkoutsToday = Number(checkouts_today.rows[0].qty || 0);
    const pixToday = Number(pix_today.rows[0].qty || 0);
    const paidToday = Number(paid_today.rows[0].qty || 0);
    const pix7d = Number(pix_generated_7d.rows[0].qty || 0);
    const pixPaid7d = Number(pix_paid_7d.rows[0].qty || 0);
    const revenue7d = Number(revenue_7d.rows[0].revenue_cents || 0);

    const stepCheckoutQty = Number(stepCheckout.rows[0].qty || 0);
    const stepPixQty = Number(stepPix.rows[0].qty || 0);
    const stepPaidQty = Number(stepPaid.rows[0].qty || 0);

    // Carrinhos abandonados (aprox) = pix gerados hoje - pagos hoje
    const abandonedToday = Math.max(pixToday - paidToday, 0);

    // Conversões
    const pixConversion = percentage(pixPaid7d, pix7d);
    const checkoutConversion = percentage(pixPaid7d, pix7d);

    // Resposta final
    res.status(200).json({
      visitors_active: visitorsActive,
      checkouts_today: checkoutsToday,
      orders_paid_today: paidToday,
      abandoned_today: abandonedToday,
      pix_generated_7d: pix7d,
      pix_paid_7d: pixPaid7d,
      revenue_7d: revenue7d,
      pix_conversion: pixConversion,
      checkout_conversion: checkoutConversion,
      steps: {
        checkout: stepCheckoutQty,
        pix_generated: stepPixQty,
        order_paid: stepPaidQty,
      },
    });
  } catch (err) {
    console.error("Erro em /api/metrics:", err);
    res.status(500).json({
      error: "Erro ao gerar métricas.",
      details: String(err),
    });
  } finally {
    if (client) client.release();
  }
}
