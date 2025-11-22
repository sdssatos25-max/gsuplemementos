// api/track.js
import { Pool } from 'pg';

// Usa a variável criada pela Vercel ao conectar o Neon
const pool = new Pool({
    connectionString: process.env.STORAGE_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { type, session_id, order_id, value_in_cents } = req.body || {};

        if (!type) {
            return res.status(400).json({ error: 'type é obrigatório' });
        }

        await pool.query(
            'INSERT INTO events (type, session_id, order_id, value_in_cents) VALUES ($1, $2, $3, $4)',
            [type, session_id || null, order_id || null, value_in_cents ?? null]
        );

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Erro em /api/track:', err);
        return res.status(500).json({ error: 'Erro ao salvar evento' });
    }
}
