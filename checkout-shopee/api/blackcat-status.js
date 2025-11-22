// api/blackcat-status.js

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { transaction_id } = req.query;

    if (!transaction_id) {
      return res.status(400).json({ error: 'transaction_id é obrigatório' });
    }

    const publicKey = process.env.BLACKCAT_PUBLIC_KEY;
    const secretKey = process.env.BLACKCAT_SECRET_KEY;

    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    const url = `https://api.blackcatpagamentos.com/v1/transactions/${transaction_id}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    return res.status(response.status).json(result);

  } catch (error) {
    console.error('ERRO STATUS BLACKCAT:', error);
    return res.status(500).json({
      error: 'Erro ao consultar transação',
      details: String(error)
    });
  }
}