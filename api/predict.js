// Vercel Serverless Function：代理 NVIDIA API + Exa 联网搜索（Agentic Tool Calling）
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const body = req.body || {};
    const { model, messages, temperature, max_tokens } = body;
    const apiKey = body.apiKey || process.env.NVIDIA_API_KEY;
    const searchKey = body.exaKey || process.env.EXA_API_KEY;
    if (!apiKey) { res.status(400).json({ error: 'missing apiKey' }); return; }

    async function exaSearch(query) {
      try {
        const r = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'x-api-key': searchKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, numResults: 3, type: 'auto', contents: { text: { maxCharacters: 500 } } })
        });
        if (!r.ok) return 'Search failed.';
        const d = await r.json();
        return (d.results || []).map(x => `[${x.title}]\n${x.text || ''}`).join('\n\n') || 'No results.';
      } catch (e) { return 'Search error: ' + e.message; }
    }

    async function callNvidia(msgs, withTools) {
      const reqBody = {
        model, messages: msgs,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 1400,
        stream: false
      };
      if (withTools) {
        reqBody.tools = [{
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the internet for latest football news, team form, injuries, squad updates, FIFA rankings for a specific national team',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string', description: 'Search query in English' } },
              required: ['query']
            }
          }
        }];
        reqBody.tool_choice = 'auto';
      }
      const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(reqBody)
      });
      return { status: r.status, data: await r.json() };
    }

    // ─── Agentic Loop ──────────────────────────────────────────────────────────
    let msgs = [...messages];
    const MAX_ROUNDS = 5;
    let finalData = null;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // 全程开 tools，让模型按需多轮搜索；最后一轮强制关掉，逼它输出最终答案
      const withTools = !!searchKey && round < MAX_ROUNDS - 1;
      const { status, data } = await callNvidia(msgs, withTools);

      if (status !== 200) { res.status(status).json(data); return; }

      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (choice?.finish_reason === 'tool_calls' && msg?.tool_calls?.length) {
        // Add assistant message (with tool_calls)
        msgs.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

        // Execute each tool call
        for (const tc of msg.tool_calls) {
          let result = 'No result.';
          try {
            const args = JSON.parse(tc.function.arguments || '{}');
            result = await exaSearch(args.query || '');
          } catch (e) {}
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }
        continue; // next round with search results in context
      }

      finalData = data;
      break;
    }

    if (!finalData) { res.status(500).json({ error: 'Agent loop: no final response' }); return; }
    res.status(200).json(finalData);
  } catch (e) {
    res.status(502).json({ error: 'upstream: ' + (e && e.message ? e.message : String(e)) });
  }
};
