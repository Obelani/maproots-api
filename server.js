const express = require('express');
const cors    = require('cors');
const fetch   = (...args) => import('node-fetch').then(m => m.default(...args));

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

app.post('/gerar-roteiro', async (req, res) => {
  if(!ANTHROPIC_KEY) return res.status(500).json({error:'ANTHROPIC_KEY não configurada'});
  const { waypoints, totalKm, totalTime } = req.body;
  if (!waypoints || !waypoints.length) return res.status(400).json({ error: 'Sem waypoints' });

  const routeDesc = waypoints.map((p, i) => {
    const stay = p.stay || 'passagem';
    const days = p.days || 1;
    const stayText = stay==='passagem'?'apenas passagem':stay==='pernoite'?'pernoite (1 noite)':`${days} dia(s)`;
    return `${i+1}. ${p.name} — ${stayText}`;
  }).join('\n');

  const prompt = `Você é um guia de viagem especialista. O viajante está planejando a seguinte rota:

${routeDesc}

Distância total: ${totalKm}
Tempo estimado: ${totalTime}

Para cada cidade onde o viajante vai FICAR (pernoite ou dias), crie um guia compacto com:
- 🏛️ Top 3 atrações (nome + 1 linha de descrição)
- 🍽️ Gastronomia típica (2-3 itens)
- 💡 1 dica local importante

Para cidades de "passagem" coloque apenas servicos com o que a cidade oferece, e atracoes:[], gastronomia:[], dica:"Ponto de passagem."

Para o campo "servicos", inclua APENAS os que a cidade realmente possui de forma relevante, escolhendo entre:
farmacia, supermercado, hospital, restaurante, parque, posto_combustivel, bar, hotel, banco, mecanica, shopping, praia, museu, aeroporto

Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois:
{"cidades":[{"nome":"...","tipo":"passagem|pernoite|dias","dias":1,"servicos":["posto_combustivel","farmacia"],"atracoes":[{"nome":"...","desc":"..."}],"gastronomia":["..."],"dica":"..."}]}`;

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
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '{"cidades":[' }
        ]
      })
    });

    const data = await r.json();
    console.log('Claude response status:', r.status);
    if (data.error) {
      console.error('Claude error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    let text = ('{"cidades":[' + data.content[0].text).trim();
    console.log('Claude text preview:', text.substring(0,150));

    // Remove markdown fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    // Extract JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found:', text);
      return res.status(500).json({ error: 'Resposta invalida do modelo. Tente novamente.' });
    }
    const json = JSON.parse(jsonMatch[0]);
    res.json(json);
  } catch (err) {
    console.error('Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({ ok: true, app: 'MapRoots API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('MapRoots backend na porta', PORT));
