const API_URL = "/api/metrics";

async function fetchMetrics() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();

        document.getElementById("errorBox").style.display = "none";

        document.getElementById("visitorsActive").innerText = data.visitors_active;
        document.getElementById("checkoutsToday").innerText = data.checkouts_today;
        document.getElementById("salesToday").innerText = data.orders_paid_today;
        document.getElementById("abandonedToday").innerText = data.abandoned_today;

        document.getElementById("revenue7d").innerText =
            "R$ " + (data.revenue_7d / 100).toFixed(2).replace(".", ",");

        document.getElementById("checkoutConversion").innerText =
            data.checkout_conversion + "%";

        document.getElementById("pixConversion").innerText =
            data.pix_conversion + "%";

        document.getElementById("pixGenerated").innerText = data.pix_generated_7d;
        document.getElementById("pixPaid").innerText = data.pix_paid_7d;

        document.getElementById("stepCheckout").innerText = data.steps.checkout;
        document.getElementById("stepPix").innerText = data.steps.pix_generated;
        document.getElementById("stepPaid").innerText = data.steps.order_paid;

        const bar = document.getElementById("pixProgress");
        bar.style.width = data.pix_conversion + "%";

    } catch (err) {
        document.getElementById("errorBox").style.display = "block";
        console.error("Erro:", err);
    }
}

setInterval(fetchMetrics, 5000);
fetchMetrics();
