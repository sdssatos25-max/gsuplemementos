// dashboard.js

function formatCurrencyBRL(cents) {
  const value = (Number(cents || 0) / 100);
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function pct(num) {
  if (!isFinite(num) || isNaN(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

// === DOM HELPERS ===
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setProgress(id, percent) {
  const el = document.getElementById(id);
  if (el) {
    el.style.width = pct(percent) + '%';
  }
}

function setFunnelStep(idFill, idText, percent) {
  const fill = document.getElementById(idFill);
  const txt = document.getElementById(idText);
  const p = pct(percent);
  if (fill) fill.style.setProperty('--percent', p);
  if (txt) txt.textContent = p + '%';
}

// === GRÁFICOS (BARRAS SIMPLES) ===
function renderBarChart(containerId, series, options) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Se não veio série ou veio vazia, exibe placeholder
  if (!series || !series.length) {
    container.innerHTML = '<div class="chart-empty">Sem dados suficientes para este período.</div>';
    return;
  }

  const key = options.key;
  const labelKey = options.labelKey || 'label';

  const maxValue = series.reduce((max, item) => {
    const v = Number(item[key] || 0);
    return v > max ? v : max;
  }, 0) || 1;

  container.innerHTML = `
    <div class="chart-bars">
      ${series.map(item => {
        const value = Number(item[key] || 0);
        const heightPercent = (value / maxValue) * 100;
        const label = String(item[labelKey] || '');
        return `
          <div class="chart-bar">
            <div class="chart-bar-inner" style="height:${heightPercent}%;"></div>
            <div class="chart-bar-label">${label}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// === CHAMADA À API ===
let currentRange = 'today';

async function loadMetrics(range) {
  try {
    const res = await fetch(`/api/metrics?range=${encodeURIComponent(range)}`);
    const data = await res.json();

    if (!res.ok) {
      console.error('Erro metrics:', data);
      showError(true);
      return;
    }

    showError(false);
    applyMetrics(data, range);
  } catch (err) {
    console.error('Erro geral ao buscar métricas:', err);
    showError(true);
  }
}

function showError(show) {
  const alert = document.getElementById('alert-error');
  if (!alert) return;
  alert.classList.toggle('hidden', !show);
}

// === APLICA AS MÉTRICAS NO LAYOUT ===
function applyMetrics(data, range) {
  currentRange = range;

  const rangeLabel = range === 'today'
    ? 'hoje'
    : (range === '30d' ? '30 dias' : '7 dias');

  const visitorsActive = Number(data.visitors_active || 0);
  const checkoutsToday = Number(data.checkouts_today || 0);
  const ordersPaidToday = Number(data.orders_paid_today || 0);
  const abandonedToday = Number(data.abandoned_today || 0);

  const pixGenerated7d = Number(data.pix_generated_7d || 0);
  const pixPaid7d = Number(data.pix_paid_7d || 0);
  const revenue7d = Number(data.revenue_7d || 0);

  const pixConversionViaApi = Number(data.pix_conversion || 0);
  const checkoutConversionViaApi = Number(data.checkout_conversion || 0);

  const steps = data.steps || {};
  const stepCheckout = Number(steps.checkout || 0);
  const stepPix = Number(steps.pix_generated || 0);
  const stepPaid = Number(steps.order_paid || 0);

  // === CARDS LIVE ===
  setText('kpi-visitors-active', visitorsActive.toString());
  setText('kpi-checkouts-today', checkoutsToday.toString());
  setText('kpi-orders-paid-today', ordersPaidToday.toString());
  setText('kpi-orders-paid-today-amount', ordersPaidToday > 0 ? 'Pedidos pagos hoje.' : 'Ainda sem pedidos pagos hoje.');
  setText('kpi-abandoned-today', abandonedToday.toString());

  // === PRINCIPAIS MÉTRICAS ===
  setText('kpi-orders-paid-7d', pixPaid7d.toString());
  setText('kpi-revenue-7d', formatCurrencyBRL(revenue7d));

  const ticket = (pixPaid7d > 0) ? (revenue7d / pixPaid7d) : 0;
  setText('kpi-ticket', formatCurrencyBRL(ticket));
  setText('label-range-kpi', rangeLabel);

  // === CONVERSÃO PIX ===
  let pixConv = pixConversionViaApi;
  if ((!pixConv || pixConv === 0) && pixGenerated7d > 0) {
    pixConv = (pixPaid7d / pixGenerated7d) * 100;
  }
  const pixConvDisplay = pct(pixConv);
  setText('kpi-pix-conversion', pixConvDisplay + '%');
  setProgress('progress-pix', pixConvDisplay);
  setText('kpi-pix-extra', `Pix gerados: ${pixGenerated7d} • Pix pagos: ${pixPaid7d}`);
  setText('kpi-pix-numbers', `${pixPaid7d} pagos de ${pixGenerated7d} gerados`);

  // === CONVERSÃO CHECKOUT ===
  let checkoutConv = checkoutConversionViaApi;
  if ((!checkoutConv || checkoutConv === 0) && stepCheckout > 0 && stepPaid > 0) {
    checkoutConv = (stepPaid / stepCheckout) * 100;
  }
  const checkoutConvDisplay = pct(checkoutConv);
  setText('kpi-checkout-conversion', checkoutConvDisplay + '%');
  setProgress('progress-checkout', checkoutConvDisplay);
  setText('kpi-checkout-numbers', `${stepPaid} pedidos pagos de ${stepCheckout} entradas no checkout`);

  // === FUNIL (ENTROU -> GEROU PIX -> PAGOU) ===
  // Percentuais relativos à primeira etapa
  const step1 = stepCheckout || pixGenerated7d || pixPaid7d || 0;
  const base = step1 > 0 ? step1 : 1;

  const percCheckout = 100;
  const percPix = (stepPix || pixGenerated7d) / base * 100;
  const percPaid = (stepPaid || pixPaid7d) / base * 100;

  setFunnelStep('funnel-step-checkout', 'funnel-step-checkout-text', percCheckout);
  setFunnelStep('funnel-step-pix', 'funnel-step-pix-text', percPix);
  setFunnelStep('funnel-step-paid', 'funnel-step-paid-text', percPaid);

  // === GRÁFICOS (se o backend enviar séries, usa; senão mostra placeholder) ===
  const charts = data.charts || {};

  // Vendas / dia
  if (charts.revenue && charts.revenue.length) {
    const seriesRevenue = charts.revenue.map(row => ({
      label: (row.day_label || row.day || '').toString().slice(5, 10), // mm-dd
      value_in_cents: Number(row.value_in_cents || row.value || 0)
    }));
    renderBarChart('chart-revenue', seriesRevenue, {
      key: 'value_in_cents',
      labelKey: 'label'
    });
  } else {
    renderBarChart('chart-revenue', null, { key: 'value_in_cents' });
  }

  // Pix / dia
  if (charts.pix && charts.pix.length) {
    // Para simplificar, usa só pix_generated na barra; você pode duplicar para 2 barras se quiser depois
    const seriesPix = charts.pix.map(row => ({
      label: (row.day_label || row.day || '').toString().slice(5, 10),
      pix_generated: Number(row.pix_generated || 0)
    }));
    renderBarChart('chart-pix', seriesPix, {
      key: 'pix_generated',
      labelKey: 'label'
    });
  } else {
    renderBarChart('chart-pix', null, { key: 'pix_generated' });
  }
}

// === CONTROLA BOTÕES DE PERÍODO ===
function setupPeriodButtons() {
  const buttons = document.querySelectorAll('.period-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.getAttribute('data-range') || 'today';
      loadMetrics(range);
    });
  });
}

// Atualização automática a cada 25s
function setupAutoRefresh() {
  setInterval(() => {
    loadMetrics(currentRange);
  }, 25000);
}

document.addEventListener('DOMContentLoaded', () => {
  setupPeriodButtons();
  setupAutoRefresh();
  loadMetrics(currentRange);
});
