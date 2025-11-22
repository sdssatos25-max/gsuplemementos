// api/blackcat.js
// Endpoint para CRIAR a transação Pix na Blackcat com segurança (no servidor)

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const payload = req.body;

    const publicKey = process.env.BLACKCAT_PUBLIC_KEY;
    const secretKey = process.env.BLACKCAT_SECRET_KEY;

    if (!publicKey || !secretKey) {
      res.status(500).json({ error: 'Keys da Blackcat não configuradas no servidor' });
      return;
    }

    const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    const resp = await fetch('https://api.blackcatpagamentos.com/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    res.status(resp.status).json(data);
  } catch (err) {
    console.error('Erro em /api/blackcat:', err);
    res.status(500).json({ error: 'Erro ao criar transação Pix' });
  }
};
