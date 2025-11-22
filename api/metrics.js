import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function percentage(part, total) {
    if (total === 0) return 0;
    return Math.round((part / total) * 100);
}

export default async function handler(req, res) {
    try {
        const client = await pool.connect();

        // Visitantes últimos 5 min
        const visitors_active = await client.query(`
      SELECT COUNT(DISTINCT session_id) 
      FROM events 
      WHERE type = 'checkout_view'
      AND created_at > NOW() - INTERVAL '5 minutes'
    `);

        // Checkouts hoje
        const checkouts_today = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'checkout_view'
      AND created_at::DATE = CURRENT_DATE
    `);

        // Pix gerados hoje
        const pix_today = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'pix_generated'
      AND created_at::DATE = CURRENT_DATE
    `);

        // Pedidos pagos hoje
        const paid_today = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'order_paid'
      AND created_at::DATE = CURRENT_DATE
    `);

        // Pix gerados últimos 7 dias
        const pix_generated_7d = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'pix_generated'
      AND created_at > NOW() - INTERVAL '7 days'
    `);

        const pix_paid_7d = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'order_paid'
      AND created_at > NOW() - INTERVAL '7 days'
    `);

        // Receita últimos 7 dias
        const revenue_7d = await client.query(`
      SELECT COALESCE(SUM(value_in_cents), 0) 
      FROM events 
      WHERE type = 'order_paid'
      AND created_at > NOW() - INTERVAL '7 days'
    `);

        // Comportamento últimos 10 min
        const stepCheckout = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'checkout_view'
      AND created_at > NOW() - INTERVAL '10 minutes'
    `);

        const stepPix = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'pix_generated'
      AND created_at > NOW() - INTERVAL '10 minutes'
    `);

        const stepPaid = await client.query(`
      SELECT COUNT(*) 
      FROM events 
      WHERE type = 'order_paid'
      AND created_at > NOW() - INTERVAL '10 minutes'
    `);

        const pixTotal = Number(pix_generated_7d.rows[0].count);
        const paidTotal = Number(pix_paid_7d.rows[0].count);

        const abandonedToday = Number(pix_today.rows[0].count) - Number(paid_today.rows[0].count);

        client.release();

        res.status(200).json({
            visitors_active: Number(visitors_active.rows[0].count),
            checkouts_today: Number(checkouts_today.rows[0].count),
            orders_paid_today: Number(paid_today.rows[0].count),
            abandoned_today: abandonedToday,
            pix_generated_7d: pixTotal,
            pix_paid_7d: paidTotal,
            revenue_7d: Number(revenue_7d.rows[0].coalesce),
            pix_conversion: percentage(paidTotal, pixTotal),
            checkout_conversion: percentage(paidTotal, pixTotal),

            steps: {
                checkout: Number(stepCheckout.rows[0].count),
                pix_generated: Number(stepPix.rows[0].count),
                order_paid: Number(stepPaid.rows[0].count)
            }
        });

    } catch (err) {
        console.error("Erro metrics:", err);
        res.status(500).json({ error: "Erro ao gerar métricas." });
    }
}
