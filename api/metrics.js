// api/metrics.js
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.STORAGE_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOf7DaysAgo() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d;
}

const formatBRL = (cents) =>
    `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;

export default async function handler(req, res) {
    try {
        const now = new Date();
        const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const today = startOfToday();
        const sevenDaysAgo = startOf7DaysAgo();

        // Visitantes ativos nos últimos 5 minutos
        const visitorsResult = await pool.query(
            `SELECT COUNT(DISTINCT session_id) AS count
       FROM events
       WHERE created_at >= $1 AND session_id IS NOT NULL`,
            [fiveMinAgo.toISOString()]
        );
        const visitorsNow = Number(visitorsResult.rows[0]?.count || 0);

        // Checkouts iniciados hoje
        const checkoutsResult = await pool.query(
            `SELECT COUNT(*) AS count
       FROM events
       WHERE type = 'checkout_started' AND created_at >= $1`,
            [today.toISOString()]
        );
        const checkoutsStarted = Number(checkoutsResult.rows[0]?.count || 0);

        // Pix gerados hoje
        const pixGenResult = await pool.query(
            `SELECT COUNT(*) AS count
       FROM events
       WHERE type = 'pix_generated' AND created_at >= $1`,
            [today.toISOString()]
        );
        const pixGenerated = Number(pixGenResult.rows[0]?.count || 0);

        // Vendas pagas hoje
        const salesTodayResult = await pool.query(
            `SELECT
          COALESCE(SUM(value_in_cents), 0) AS total,
          COUNT(*) AS count
        FROM events
        WHERE type = 'order_paid' AND created_at >= $1`,
            [today.toISOString()]
        );
        const salesTodayCents = Number(salesTodayResult.rows[0]?.total || 0);
        const ordersPaidToday = Number(salesTodayResult.rows[0]?.count || 0);

        // Carrinhos abandonados (aprox: pix gerado - pago)
        const abandonedCarts = Math.max(pixGenerated - ordersPaidToday, 0);
        const abandonedRate =
            pixGenerated > 0 ? Math.round((abandonedCarts / pixGenerated) * 100) : 0;

        // Últimos 7 dias
        const stats7dResult = await pool.query(
            `SELECT
          COUNT(*) FILTER (WHERE type = 'order_paid') AS orders_paid,
          COALESCE(SUM(value_in_cents) FILTER (WHERE type = 'order_paid'), 0) AS revenue_paid,
          COUNT(*) FILTER (WHERE type = 'checkout_started') AS checkouts_started
        FROM events
        WHERE created_at >= $1`,
            [sevenDaysAgo.toISOString()]
        );

        const row7d = stats7dResult.rows[0] || {};
        const orders7d = Number(row7d.orders_paid || 0);
        const revenue7dCents = Number(row7d.revenue_paid || 0);
        const checkouts7d = Number(row7d.checkouts_started || 0);
        const conversion7d =
            checkouts7d > 0 ? Number(((orders7d / checkouts7d) * 100).toFixed(1)) : 0;

        res.status(200).json({
            visitorsNow,
            checkoutsStarted,
            checkoutsChangeText: '+0% vs ontem', // placeholder
            salesTodayBRL: formatBRL(salesTodayCents),
            salesChangeText: '+0% vs ontem',     // placeholder
            abandonedCarts,
            abandonedRateText: `${abandonedRate}% abandono`,
            orders7d,
            revenue7dBRL: formatBRL(revenue7dCents),
            conversion7d,
            abandonedList: [] // dá pra popular depois com detalhes
        });
    } catch (err) {
        console.error('Erro em /api/metrics:', err);
        res.status(500).json({ error: 'Erro ao carregar métricas' });
    }
}
