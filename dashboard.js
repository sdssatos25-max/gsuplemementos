// dashboard.js

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

async function loadMetrics() {
  const errorBanner = document.getElementById('metrics-error');

  try {
    const resp = await fetch('/api/metrics', { cache: 'no-store' });
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

    // Preencher cards
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
  } catch (err) {
    console.error('Erro ao carregar métricas do dashboard:', err);
    if (errorBanner) errorBanner.classList.remove('hidden');
  }
}

// Carregar ao abrir a página e atualizar a cada 15s
document.addEventListener('DOMContentLoaded', () => {
  loadMetrics();
  setInterval(loadMetrics, 15000);
});
