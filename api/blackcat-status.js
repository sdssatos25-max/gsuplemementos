// api/blackcat-status.js
// Endpoint para CONSULTAR o status da transação Pix na Blackcat

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método não permitido' });
        return;
    }

    try {
        const { transaction_id } = req.query;

        if (!transaction_id) {
            res.status(400).json({ error: 'transaction_id é obrigatório' });
            return;
        }

        const publicKey = process.env.BLACKCAT_PUBLIC_KEY;
        const secretKey = process.env.BLACKCAT_SECRET_KEY;

        if (!publicKey || !secretKey) {
            res.status(500).json({ error: 'Keys da Blackcat não configuradas no servidor' });
            return;
        }

        const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

        const url = `https://api.blackcatpagamentos.com/v1/transactions/${encodeURIComponent(
            transaction_id
        )}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: auth,
                'Content-Type': 'application/json'
            }
        });

        const data = await resp.json();

        res.status(resp.status).json(data);
    } catch (err) {
        console.error('Erro em /api/blackcat-status:', err);
        res.status(500).json({ error: 'Erro ao consultar transação Pix' });
    }
};
