const API_URL = "/api/metrics";

async function fetchMetrics() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    // Se a API respondeu erro, joga pro catch
    if (!res.ok || data.error) {
      throw new Error(data.details || data.error || "Erro HTTP " + res.status);
    }

    // Esconde barra de erro
    document.getElementById("errorBox").style.display = "none";

    // Valores básicos
    document.getElementById("visitorsActive").innerText = data.visitors_active ?? "0";
    document.getElementById("checkoutsToday").innerText = data.checkouts_today ?? "0";
    document.getElementById("salesToday").innerText = data.orders_paid_today ?? "0";
    document.getElementById("abandonedToday").innerText = data.abandoned_today ?? "0";

    // Receita 7 dias
    document.getElementById("revenue7d").innerText =
      "R$ " +
      ((data.revenue_7d ?? 0) / 100)
        .toFixed(2)
        .replace(".", ",");

    // Conversões
    document.getElementById("checkoutConversion").innerText =
      (data.checkout_conversion ?? 0) + "%";

    document.getElementById("pixConversion").innerText =
      (data.pix_conversion ?? 0) + "%";

    // Pix gerados/pagos
    document.getElementById("pixGenerated").innerText =
      data.pix_generated_7d ?? "0";
    document.getElementById("pixPaid").innerText =
      data.pix_paid_7d ?? "0";

    // Comportamento (funil)
    document.getElementById("stepCheckout").innerText =
      data.steps?.checkout ?? "0";
    document.getElementById("stepPix").innerText =
      data.steps?.pix_generated ?? "0";
    document.getElementById("stepPaid").innerText =
      data.steps?.order_paid ?? "0";

    // Barra de progresso da conversão de pix
    const bar = document.getElementById("pixProgress");
    const conv = data.pix_conversion ?? 0;
    bar.style.width = Math.min(conv, 100) + "%";
  } catch (err) {
    console.error("Erro ao buscar métricas:", err);
    const errorBox = document.getElementById("errorBox");
    errorBox.style.display = "block";
    errorBox.textContent =
      "Erro ao carregar métricas do painel. Verifique se /api/metrics está funcionando. Detalhe: " +
      err.message;

    // Preenche tudo com traço para não ficar “undefined”
    const ids = [
      "visitorsActive",
      "checkoutsToday",
      "salesToday",
      "abandonedToday",
      "revenue7d",
      "checkoutConversion",
      "pixConversion",
      "pixGenerated",
      "pixPaid",
      "stepCheckout",
      "stepPix",
      "stepPaid",
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerText = "–";
    });

    const bar = document.getElementById("pixProgress");
    if (bar) bar.style.width = "0%";
  }
}

// Atualiza a cada 5 segundos
setInterval(fetchMetrics, 5000);
fetchMetrics();
