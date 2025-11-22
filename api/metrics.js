// api/metrics.js
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Gera labels contínuos de datas e preenche séries com zeros
function buildTimeSeries(daysBack, revenueRows, checkoutRows, pixRows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = daysBack + 1;
  const labels = [];
  const dateIndex = {};

  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    labels.push(key);
    dateIndex[key] = labels.length - 1;
  }

  const series = {
    revenue: new Array(totalDays).fill(0),
    checkouts: new Array(totalDays).fill(0),
    pix_generated: new Array(totalDays).fill(0),
    pix_paid: new Array(totalDays).fill(0)
  };

  // Receita
  for (const row of revenueRows) {
    const dayKey =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day);
    const idx = dateIndex[dayKey];
    if (idx !== undefined) {
      series.revenue[idx] = num(row.sum);
    }
  }

  // Checkouts
  for (const row of checkoutRows) {
    const dayKey =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day);
    const idx = dateIndex[dayKey];
    if (idx !== undefined) {
      series.checkouts[idx] = num(row.count);
    }
  }

  // Pix gerado x pago
  for (const row of pixRows) {
    const dayKey =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day);
    const idx = dateIndex[dayKey];
    if (idx === undefined) continue;

    const count = num(row.count);
    if (row.type === 'pix_generated') {
      series.pix_generated[idx] += count;
    } else if (row.type === 'order_paid') {
      series.pix_paid[idx] += count;
    }
  }

  return { labels, series };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ===== Range (today | 7d | 30d) =====
  const rangeParam = String(req.query.range || '7d');
  let range = '7d';
  if (['today', '7d', '30d'].includes(rangeParam)) {
    range = rangeParam;
  }

  // daysBack: 0 => só hoje, 6 => últimos 7 dias, 29 => últimos 30 dias
  let daysBack = 6;
  switch (range) {
    case 'today':
      daysBack = 0;
      break;
    case '30d':
      daysBack = 29;
      break;
    default:
      daysBack = 6;
  }

  try {
    const client = await pool.connect();

    try {
      const rangeParamValue = [daysBack];

      const [
        // Visitantes ativos (últimos 5 minutos)
        visitorsActiveResult,
        // Base agregada do período
        baseStatsResult,
        // Comportamento últimos 10 minutos
        stepsLast10Result,
        // Séries para gráficos
        revenueSeriesResult,
        checkoutsSeriesResult,
        pixSeriesResult
      ] = await Promise.all([
        client.query(`
          SELECT COUNT(DISTINCT session_id) AS count
          FROM events
          WHERE created_at >= NOW() - INTERVAL '5 minutes'
        `),

        client.query(
          `
          SELECT
            SUM(CASE WHEN type = 'checkout' THEN 1 ELSE 0 END) AS checkouts,
            SUM(CASE WHEN type = 'order_paid' THEN 1 ELSE 0 END) AS orders_paid,
            SUM(CASE WHEN type = 'pix_generated' THEN 1 ELSE 0 END) AS pix_generated,
            SUM(CASE WHEN type = 'order_paid' THEN value_in_cents ELSE 0 END) AS revenue
          FROM events
          WHERE created_at::date >= CURRENT_DATE - $1 * INTERVAL '1 day'
        `,
          rangeParamValue
        ),

        client.query(`
          SELECT type, COUNT(*) AS count
          FROM events
          WHERE created_at >= NOW() - INTERVAL '10 minutes'
            AND type IN ('checkout', 'pix_generated', 'order_paid')
          GROUP BY type
        `),

        client.query(
          `
          SELECT created_at::date AS day,
                 COALESCE(SUM(value_in_cents), 0) AS sum
          FROM events
          WHERE type = 'order_paid'
            AND created_at::date >= CURRENT_DATE - $1 * INTERVAL '1 day'
          GROUP BY day
          ORDER BY day
        `,
          rangeParamValue
        ),

        client.query(
          `
          SELECT created_at::date AS day,
                 COUNT(*) AS count
          FROM events
          WHERE type = 'checkout'
            AND created_at::date >= CURRENT_DATE - $1 * INTERVAL '1 day'
          GROUP BY day
          ORDER BY day
        `,
          rangeParamValue
        ),

        client.query(
          `
          SELECT created_at::date AS day,
                 type,
                 COUNT(*) AS count
          FROM events
          WHERE type IN ('pix_generated', 'order_paid')
            AND created_at::date >= CURRENT_DATE - $1 * INTERVAL '1 day'
          GROUP BY day, type
          ORDER BY day
        `,
          rangeParamValue
        )
      ]);

      const visitors_active = num(visitorsActiveResult.rows[0]?.count);

      const baseRow = baseStatsResult.rows[0] || {};
      const checkouts_range = num(baseRow.checkouts);
      const orders_paid_range = num(baseRow.orders_paid);
      const pix_generated_range = num(baseRow.pix_generated);
      const revenue_range = num(baseRow.revenue);

      const abandoned_range = Math.max(
        pix_generated_range - orders_paid_range,
        0
      );

      const pix_conversion =
        pix_generated_range > 0
          ? Math.round((orders_paid_range / pix_generated_range) * 1000) / 10
          : 0;

      // Pode ser outra fórmula depois, mas por enquanto usamos a mesma base.
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

      const { labels, series } = buildTimeSeries(
        daysBack,
        revenueSeriesResult.rows,
        checkoutsSeriesResult.rows,
        pixSeriesResult.rows
      );

      res.status(200).json({
        // Mantive os mesmos nomes de antes, mas agora significam "no período"
        visitors_active,
        checkouts_today: checkouts_range,
        orders_paid_today: orders_paid_range,
        abandoned_today: abandoned_range,
        pix_generated_7d: pix_generated_range,
        pix_paid_7d: orders_paid_range,
        revenue_7d: revenue_range,
        pix_conversion,
        checkout_conversion,
        steps: stepsMap,
        selected_range: range,
        series: {
          labels, // array de 'YYYY-MM-DD'
          revenue: series.revenue, // centavos
          checkouts: series.checkouts,
          pix_generated: series.pix_generated,
          pix_paid: series.pix_paid
        }
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
