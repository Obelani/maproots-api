const express = require('express');
const cors    = require('cors');
const fetch   = (...args) => import('node-fetch').then(m => m.default(...args));

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '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';

// ---- Gerar roteiro de viagem ----
app.post('/gerar-roteiro', async (req, res) => {
  const { waypoints, totalKm, totalTime } = req.body;
  if (!waypoints || !waypoints.length) return res.status(400).json({ error: 'Sem waypoints' });

  // Monta descrição da rota para o Claude
  const routeDesc = waypoints.map((p, i) => {
    const stay = p.stay || 'passagem';
    const days = p.days || 1;
    const stayText = stay === 'passagem' ? 'apenas passagem' : stay === 'pernoite' ? 'pernoite (1 noite)' : `${days} dia(s)`;
    return `${i + 1}. ${p.name} — ${stayText}`;
  }).join('\n');

  const prompt = `Você é um guia de viagem especialista. O viajante está planejando a seguinte rota:

${routeDesc}

Distância total: ${totalKm}
Tempo estimado: ${totalTime}

Para cada cidade onde o viajante vai ficar (pernoite ou dias), crie um guia compacto com:
- 🏛️ Top 3 atrações (nome + 1 linha de descrição)
- 🍽️ Gastronomia típica (2-3 pratos ou restaurantes)
- 💡 1 dica local importante
- Para cidades com "dias", adapte as sugestões à quantidade de dias disponíveis

Para cidades de "passagem", escreva apenas: "Ponto de passagem — continue viagem."

Responda APENAS em JSON válido, sem markdown, sem explicações, no seguinte formato:
{
  "cidades": [
    {
      "nome": "Nome da cidade",
      "tipo": "passagem|pernoite|dias",
      "dias": 1,
      "atracoes": [{"nome": "...", "desc": "..."}],
      "gastronomia": ["...","..."],
      "dica": "..."
    }
  ]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content[0].text.trim();
    const json = JSON.parse(text);
    res.json(json);
  } catch (err) {
    console.error('Erro Claude:', err);
    res.status(500).json({ error: 'Erro ao gerar roteiro' });
  }
});

// ---- Health check ----
app.get('/', (req, res) => res.json({ ok: true, app: 'MapRoots API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('MapRoots backend na porta', PORT));
