// api/blackcat.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const publicKey = process.env.BLACKCAT_PUBLIC_KEY;
        const secretKey = process.env.BLACKCAT_SECRET_KEY;

        if (!publicKey || !secretKey) {
            return res.status(500).json({ error: 'Keys da Blackcat não configuradas no servidor' });
        }

        const payload = req.body;

        const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

        const response = await fetch('https://api.blackcatpagamentos.com/v1/transactions', {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        return res.status(response.status).json(result);

    } catch (error) {
        console.error('ERRO BLACKCAT:', error);
        return res.status(500).json({
            error: 'Erro ao processar a transação Pix',
            details: String(error)
        });
    }
}