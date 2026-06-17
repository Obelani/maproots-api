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
    const stayText = stay==='passagem'
      ? 'apenas passagem'
      : stay==='pernoite'
        ? 'pernoite (1 noite)'
        : `${days} dia(s)`;
    return `${i+1}. ${p.name} — ${stayText}`;
  }).join('\n');

  const prompt = `Você é um guia de viagem especialista. O viajante está planejando a seguinte rota:

${routeDesc}

Distância total: ${totalKm}
Tempo estimado: ${totalTime}

Gere um JSON com informações para cada cidade seguindo estas regras:

━━━ CIDADES DE "PASSAGEM" ━━━
Retorne: atracoes:[], gastronomia:[], dica:"Ponto de passagem.", dias_roteiro:[]
Inclua apenas o campo "servicos" com o que a cidade possui.

━━━ CIDADES DE "PERNOITE" (1 noite) ━━━
Retorne guia compacto:
- atracoes: top 3 atrações (nome + 1 linha de descrição)
- gastronomia: 2-3 pratos/itens típicos
- dica: 1 dica local importante
- dias_roteiro: [] (vazio para pernoite)

━━━ CIDADES COM DIAS DE ESTADIA ━━━
Para cidades onde o viajante vai FICAR VÁRIOS DIAS, crie um roteiro DIA A DIA completo.
Cada dia deve ter atividades para manhã, tarde e noite — sendo coerente com a quantidade de dias informada.
Varie os programas: passeios culturais, parques, mercados, gastronomia local, barzinhos, vida noturna, experiências locais.
- atracoes: [] (vazio, pois o roteiro dia a dia já cobre)
- gastronomia: 3-4 pratos/itens típicos da cidade
- dica: 1 dica local importante
- dias_roteiro: array com um objeto por dia

━━━ CAMPO SERVICOS ━━━
Para TODAS as cidades, inclua apenas os serviços que realmente existem de forma relevante, escolhendo entre:
farmacia, supermercado, hospital, restaurante, parque, posto_combustivel, bar, hotel, banco, mecanica, shopping, praia, museu, aeroporto

━━━ FORMATO JSON ━━━
Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois:
{"cidades":[{
  "nome":"...",
  "tipo":"passagem|pernoite|dias",
  "dias":1,
  "servicos":["posto_combustivel","farmacia"],
  "atracoes":[{"nome":"...","desc":"..."}],
  "gastronomia":["..."],
  "dica":"...",
  "dias_roteiro":[{
    "dia":1,
    "manha":"Descrição detalhada do passeio da manhã com nome do local e dica",
    "tarde":"Descrição detalhada do passeio da tarde com nome do local e dica",
    "noite":"Sugestão de restaurante, bar ou programa noturno com nome e descrição"
  }]
}]}`;

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
        max_tokens: 16000,
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
    console.log('Claude text preview:', text.substring(0, 200));

    // Remove markdown fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    // Extract JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found:', text);
      return res.status(500).json({ error: 'Resposta inválida do modelo. Tente novamente.' });
    }

    let jsonStr = jsonMatch[0];

    // Se o JSON foi cortado (max_tokens atingido), tentar fechar o JSON truncado
    try {
      JSON.parse(jsonStr);
    } catch(parseErr) {
      console.warn('JSON truncado, tentando reparar...');
      // Fechar arrays e objetos abertos
      const opens = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
      const openBraces = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
      // Remover vírgula/conteúdo incompleto no final
      jsonStr = jsonStr.replace(/,\s*$/, '').replace(/,\s*[^,{\["\.\d\w]*$/, '');
      for(let i=0;i<opens;i++) jsonStr += ']';
      for(let i=0;i<openBraces;i++) jsonStr += '}';
    }

    const json = JSON.parse(jsonStr);
    res.json(json);
  } catch (err) {
    console.error('Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({ ok: true, app: 'MapRoots API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('MapRoots backend na porta', PORT));
