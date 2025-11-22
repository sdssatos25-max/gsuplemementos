// dashboard.js

let currentRange = '7d';
let revenueChart = null;
let pixChart = null;

function safeNumber(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return value;
}

function formatBRLFromCents(cents) {
  const v = safeNumber(cents) / 100;
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function setPercent(id, barId, value) {
  const el = document.getElementById(id);
  const bar = document.getElementById(barId);
  const v = safeNumber(value);
  const pct = Math.max(0, Math.min(100, v));

  if (el) el.textContent = `${pct.toFixed(1)}%`;
  if (bar) bar.style.width = `${pct}%`;
}

function rangeLabel(k) {
  switch (k) {
    case 'today':
      return 'Hoje';
    case '30d':
      return 'Últimos 30 dias';
    default:
      return 'Últimos 7 dias';
  }
}

function formatLabelDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function updateCharts(series) {
  if (!series || !Array.isArray(series.labels)) return;

  const labels = series.labels.map(formatLabelDate);
  const revenue = (series.revenue || []).map((c) => c / 100);
  const pixGenerated = series.pix_generated || [];
  const pixPaid = series.pix_paid || [];

  // ===== Gráfico de Receita (linha) =====
  const ctxRevenue = document
    .getElementById('chart-revenue')
    .getContext('2d');

  if (!revenueChart) {
    revenueChart = new Chart(ctxRevenue, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Receita (R$)',
            data: revenue,
            tension: 0.3,
            borderWidth: 2.5,
            fill: true,
            backgroundColor: 'rgba(108, 92, 231, 0.12)',
            borderColor: '#6c5ce7',
            pointRadius: 3,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `Receita: R$ ${ctx.parsed.y.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2
                })}`
            }
          }
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, autoSkip: true },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.25)' }
          }
        }
      }
    });
  } else {
    revenueChart.data.labels = labels;
    revenueChart.data.datasets[0].data = revenue;
    revenueChart.update();
  }

  // ===== Gráfico de Pix (barras) =====
  const ctxPix = document.getElementById('chart-pix').getContext('2d');

  if (!pixChart) {
    pixChart = new Chart(ctxPix, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Pix gerados',
            data: pixGenerated,
            backgroundColor: 'rgba(129, 140, 248, 0.6)'
          },
          {
            label: 'Pix pagos',
            data: pixPaid,
            backgroundColor: '#6c5ce7'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.25)' }
          }
        }
      }
    });
  } else {
    pixChart.data.labels = labels;
    pixChart.data.datasets[0].data = pixGenerated;
    pixChart.data.datasets[1].data = pixPaid;
    pixChart.update();
  }
}

async function loadMetrics(range = currentRange) {
  currentRange = range;
  const errorBanner = document.getElementById('metrics-error');

  // Atualizar rótulos de range nos gráficos
  setText('range-label-revenue', rangeLabel(range));
  setText('range-label-pix', rangeLabel(range));

  try {
    const resp = await fetch(`/api/metrics?range=${encodeURIComponent(range)}`, {
      cache: 'no-store'
    });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data?.error || 'Erro desconhecido');
    }

    if (errorBanner) errorBanner.classList.add('hidden');

    const visitors_active = safeNumber(data.visitors_active);
    const checkouts_today = safeNumber(data.checkouts_today);
    const orders_paid_today = safeNumber(data.orders_paid_today);
    const abandoned_today = safeNumber(data.abandoned_today);

    const revenue_7d = safeNumber(data.revenue_7d);
    const pix_generated_7d = safeNumber(data.pix_generated_7d);
    const pix_paid_7d = safeNumber(data.pix_paid_7d);

    const pix_conversion = safeNumber(data.pix_conversion);
    const checkout_conversion = safeNumber(data.checkout_conversion);

    const steps = data.steps || {};
    const step_checkout = safeNumber(steps.checkout);
    const step_pix_generated = safeNumber(steps.pix_generated);
    const step_order_paid = safeNumber(steps.order_paid);

    // ===== Cards =====
    setText('visitors-active', visitors_active);
    setText('checkouts-today', checkouts_today);
    setText('orders-paid-today', orders_paid_today);
    setText('abandoned-today', abandoned_today);

    setText('revenue-7d', formatBRLFromCents(revenue_7d));

    setPercent('pix-conversion', 'pix-conversion-bar', pix_conversion);
    setPercent(
      'checkout-conversion',
      'checkout-conversion-bar',
      checkout_conversion
    );

    setText('pix-generated-7d', pix_generated_7d);
    setText('pix-paid-7d', pix_paid_7d);

    setText('step-checkout', step_checkout);
    setText('step-pix-generated', step_pix_generated);
    setText('step-order-paid', step_order_paid);

    // ===== Gráficos =====
    if (data.series) {
      updateCharts(data.series);
    }
  } catch (err) {
    console.error('Erro ao carregar métricas do dashboard:', err);
    if (errorBanner) errorBanner.classList.remove('hidden');
  }
}

// Configurar botões de range
function initRangeButtons() {
  const buttons = document.querySelectorAll('.range-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = btn.getAttribute('data-range');
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadMetrics(range);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initRangeButtons();
  loadMetrics(currentRange);
  // Atualização automática a cada 15s
  setInterval(() => loadMetrics(currentRange), 15000);
});
