// api/utmify.js
// Endpoint para enviar o pedido para a Utmify sem expor o token no front

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido' });
        return;
    }

    try {
        const body = req.body;

        const utmifyToken = process.env.UTMIFY_API_TOKEN;
        const utmifyEndpoint = 'https://api.utmify.com.br/api-credentials/orders';

        if (!utmifyToken) {
            res.status(500).json({ error: 'Token da Utmify não configurado no servidor' });
            return;
        }

        const resp = await fetch(utmifyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-token': utmifyToken
            },
            body: JSON.stringify(body)
        });

        const data = await resp.json();

        res.status(resp.status).json(data);
    } catch (err) {
        console.error('Erro em /api/utmify:', err);
        res.status(500).json({ error: 'Erro ao enviar pedido para Utmify' });
    }
};
