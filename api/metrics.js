import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    const now = new Date();

    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const today = now.toISOString().slice(0, 10);

    // Visitantes ativos (últimos 5 min)
    const activeVisitors = await sql`
      SELECT COUNT(DISTINCT session_id) AS total
      FROM events
      WHERE event_type = 'checkout_view'
      AND created_at >= ${fiveMinAgo}
    `;

    // Checkouts iniciados hoje
    const pixGeneratedToday = await sql`
      SELECT COUNT(*) AS total
      FROM events
      WHERE event_type = 'pix_generated'
      AND DATE(created_at) = ${today}
    `;

    // Vendas hoje
    const paidToday = await sql`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(amount_cents),0) AS total_amount
      FROM events
      WHERE event_type = 'order_paid'
      AND DATE(created_at) = ${today}
    `;

    // Carrinhos abandonados
    const abandonedToday = await sql`
      SELECT 
        (SELECT COUNT(*) FROM events WHERE event_type='pix_generated' AND DATE(created_at)=${today}) -
        (SELECT COUNT(*) FROM events WHERE event_type='order_paid' AND DATE(created_at)=${today})
      AS total
    `;

    // Conversão últimos 7 dias
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const pix7d = await sql`
      SELECT COUNT(*) AS total FROM events
      WHERE event_type='pix_generated'
      AND created_at >= ${sevenDaysAgo}
    `;

    const paid7d = await sql`
      SELECT COUNT(*) AS total FROM events
      WHERE event_type='order_paid'
      AND created_at >= ${sevenDaysAgo}
    `;

    const conversion = pix7d.rows[0].total > 0 
      ? (paid7d.rows[0].total / pix7d.rows[0].total) * 100 
      : 0;

    // Comportamento do cliente (últimos 10 minutos)
    const behavior = await sql`
      SELECT event_type, COUNT(*) AS total
      FROM events
      WHERE created_at >= ${tenMinAgo}
      GROUP BY event_type
    `;

    res.status(200).json({
      activeVisitors: activeVisitors.rows[0].total,
      checkoutsToday: pixGeneratedToday.rows[0].total,
      paidOrdersToday: paidToday.rows[0].total,
      revenueToday: paidToday.rows[0].total_amount / 100,
      abandonedToday: abandonedToday.rows[0].total,
      pixGenerated7d: pix7d.rows[0].total,
      pixPaid7d: paid7d.rows[0].total,
      conversion7d: conversion.toFixed(2),
      behavior: behavior.rows
    });

  } catch (err) {
    console.error('Erro metrics:', err);
    res.status(500).json({ error: 'Erro ao calcular métricas' });
  }
}
