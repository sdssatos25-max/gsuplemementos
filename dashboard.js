// ===== ESTADO GLOBAL =====
let currentRange = 'today'; // 'today' | '7d' | '30d'
let revenueChart = null;
let pixChart = null;

// ===== HELPERS BÁSICOS =====
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatLabelDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);

  if (currentRange === 'today') {
    // Ex.: 14:30
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Ex.: 22/11
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  });
}

function animateNumber(el, target, prefix = '', suffix = '') {
  if (!el) return;
  const start = safeNumber(el.dataset.value || 0);
  const end = safeNumber(target);
  const duration = 350;
  const startTime = performance.now();

  el.dataset.value = end;

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = start + (end - start) * progress;
    el.textContent =
      prefix +
      value.toLocaleString('pt-BR', {
        maximumFractionDigits: 0
      }) +
      suffix;

    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function setText(elId, value, formatter) {
  const el = document.getElementById(elId);
  if (!el) return;
  const v = value ?? 0;
  el.textContent = formatter ? formatter(v) : String(v);
}

// ===== APLICAÇÃO DAS MÉTRICAS NOS CARDS =====
function applyMetricsToCards(m) {
  if (!m) return;

  // Visitantes ativos (últimos 5 min)
  setText('visitors-active-value', safeNumber(m.visitors_active), (v) =>
    v.toLocaleString('pt-BR')
  );

  // Checkouts iniciados hoje
  setText(
    'checkouts-today-value',
    safeNumber(m.checkouts_today),
    (v) => v.toLocaleString('pt-BR')
  );

  // Vendas hoje (Pix pago)
  const ordersPaidToday = safeNumber(m.orders_paid_today);
  setText(
    'sales-today-value',
    ordersPaidToday,
    (v) => v.toLocaleString('pt-BR')
  );

  // Carrinhos abandonados hoje
  setText(
    'abandoned-today-value',
    safeNumber(m.abandoned_today),
    (v) => v.toLocaleString('pt-BR')
  );

  // Receita (últimos 7 / 30 dias) em reais
  const revenue7d = safeNumber(m.revenue_7d) / 100;
  const revEl = document.getElementById('revenue-7d-value');
  if (revEl) {
    revEl.textContent = revenue7d.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    });
  }

  // Conversão do checkout (%)
  const checkoutConv = safeNumber(m.checkout_conversion);
  setText('checkout-conv-value', checkoutConv, (v) => `${v.toFixed(1)}%`);

  // Conversão de Pix (%)
  const pixConv = safeNumber(m.pix_conversion);
  setText('pix-conv-value', pixConv, (v) => `${v.toFixed(1)}%`);

  // Quantidades Pix gerados / pagos (card de conversão de Pix)
  setText(
    'pix-count-generated',
    safeNumber(m.pix_generated_7d),
    (v) => v.toLocaleString('pt-BR')
  );
  setText(
    'pix-count-paid',
    safeNumber(m.pix_paid_7d),
    (v) => v.toLocaleString('pt-BR')
  );

  // Comportamento do cliente (etapas bolinhas)
  if (m.steps) {
    setText(
      'step-checkout-count',
      safeNumber(m.steps.checkout),
      (v) => v.toLocaleString('pt-BR')
    );
    setText(
      'step-pix-count',
      safeNumber(m.steps.pix_generated),
      (v) => v.toLocaleString('pt-BR')
    );
    setText(
      'step-paid-count',
      safeNumber(m.steps.order_paid),
      (v) => v.toLocaleString('pt-BR')
    );
  }
}

// ===== GRÁFICOS (LINHA / BARRAS) =====
function updateCharts(series) {
  if (!series || !Array.isArray(series.labels)) return;

  const labels = series.labels.map(formatLabelDate);

  // Receita em reais
  const revenue = (series.revenue || []).map((c) => safeNumber(c) / 100);

  // Pix gerados / pagos (já normalizados)
  const pixGenerated = (series.pix_generated || []).map((v) => safeNumber(v));
  const pixPaid = (series.pix_paid || []).map((v) => safeNumber(v));

  const maxPixValue = Math.max(
    1,
    ...(pixGenerated.length ? pixGenerated : [0]),
    ...(pixPaid.length ? pixPaid : [0])
  );

  // ===== Gráfico de Receita (linha) =====
  const ctxRevenue = document
    .getElementById('chart-revenue')
    ?.getContext('2d');

  if (ctxRevenue) {
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
  }

  // ===== Gráfico de Pix (barras) =====
  const ctxPix = document.getElementById('chart-pix')?.getContext('2d');

  if (ctxPix) {
    if (!pixChart) {
      pixChart = new Chart(ctxPix, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Pix gerados',
              data: pixGenerated,
              backgroundColor: 'rgba(129, 140, 248, 0.7)',
              borderRadius: 6,
              maxBarThickness: 26,
              barPercentage: 0.6,
              categoryPercentage: 0.7
            },
            {
              label: 'Pix pagos',
              data: pixPaid,
              backgroundColor: '#6c5ce7',
              borderRadius: 6,
              maxBarThickness: 26,
              barPercentage: 0.6,
              categoryPercentage: 0.7
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
              suggestedMax: maxPixValue + 1,
              grid: { color: 'rgba(148, 163, 184, 0.25)' }
            }
          }
        }
      });
    } else {
      pixChart.data.labels = labels;
      pixChart.data.datasets[0].data = pixGenerated;
      pixChart.data.datasets[1].data = pixPaid;
      pixChart.options.scales.y.suggestedMax = maxPixValue + 1;
      pixChart.update();
    }
  }
}

// ===== FETCH DAS MÉTRICAS (API) =====
async function fetchAndRenderMetrics() {
  const errorBanner = document.getElementById('metrics-error');

  try {
    if (errorBanner) errorBanner.classList.add('hidden');

    const res = await fetch(`/api/metrics?range=${currentRange}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    applyMetricsToCards(data);
    if (data.series) {
      updateCharts(data.series);
    }
  } catch (err) {
    console.error('Erro ao carregar métricas:', err);
    if (errorBanner) errorBanner.classList.remove('hidden');
  }
}

// ===== FILTROS DE PERÍODO (Hoje / 7 dias / 30 dias) =====
function setActiveRangeButton() {
  const buttons = document.querySelectorAll('[data-range]');
  buttons.forEach((btn) => {
    const range = btn.getAttribute('data-range');
    if (range === currentRange) {
      btn.classList.add('range-active');
    } else {
      btn.classList.remove('range-active');
    }
  });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Botões de período
  const buttons = document.querySelectorAll('[data-range]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = btn.getAttribute('data-range');
      if (!range || range === currentRange) return;
      currentRange = range;
      setActiveRangeButton();
      fetchAndRenderMetrics();
    });
  });

  setActiveRangeButton();
  fetchAndRenderMetrics();

  // Atualização automática a cada 15s
  setInterval(fetchAndRenderMetrics, 15000);
});
