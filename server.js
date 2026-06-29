// WC2026 Predictor 本地服务器：托管页面 + 代理 NVIDIA API + Exa 联网搜索
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 自动加载 .env（无需 dotenv 包）
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch {}

const ROOT = __dirname;
const PORT = 8765;

function serveStatic(req, res) {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, decodeURIComponent(p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(fp).toLowerCase();
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
    res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  });
}

// 通用 HTTPS POST（返回 Promise<{status, text}>）
function httpsPost(hostname, urlPath, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(opts, r => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => resolve({ status: r.statusCode, text: data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function exaSearch(query, searchKey) {
  try {
    const { text } = await httpsPost(
      'api.exa.ai', '/search', { 'x-api-key': searchKey },
      JSON.stringify({ query, numResults: 3, type: 'auto', contents: { text: { maxCharacters: 500 } } })
    );
    const d = JSON.parse(text);
    return (d.results || []).map(x => `[${x.title}]\n${x.text || ''}`).join('\n\n') || 'No results.';
  } catch (e) { return 'Search error: ' + e.message; }
}

async function callNvidia(msgs, apiKey, model, temperature, maxTokens, withTools) {
  const reqBody = { model, messages: msgs, temperature: temperature ?? 0.7, max_tokens: maxTokens ?? 1400, stream: false };
  if (withTools) {
    reqBody.tools = [{
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the internet for latest football news, team form, injuries, squad updates, FIFA rankings',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search query in English' } },
          required: ['query']
        }
      }
    }];
    reqBody.tool_choice = 'auto';
  }
  return httpsPost(
    'integrate.api.nvidia.com', '/v1/chat/completions',
    { 'Authorization': 'Bearer ' + apiKey },
    JSON.stringify(reqBody)
  );
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/predict') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'bad json' })); return; }

      const { model, messages, temperature, max_tokens } = payload;
      const apiKey = payload.apiKey || process.env.NVIDIA_API_KEY;
      const searchKey = payload.exaKey || process.env.EXA_API_KEY;
      if (!apiKey) { res.writeHead(400); res.end(JSON.stringify({ error: 'missing apiKey' })); return; }

      try {
        let msgs = [...messages];
        const MAX_ROUNDS = 5;
        let finalStatus = 200, finalBody = null;

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const withTools = round === 0 && !!searchKey;
          const { status, text } = await callNvidia(msgs, apiKey, model, temperature, max_tokens, withTools);
          const data = JSON.parse(text);

          if (status !== 200) { finalStatus = status; finalBody = data; break; }

          const choice = data.choices?.[0];
          const msg = choice?.message;

          if (choice?.finish_reason === 'tool_calls' && msg?.tool_calls?.length) {
            msgs.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
            for (const tc of msg.tool_calls) {
              let result = 'No result.';
              try {
                const args = JSON.parse(tc.function.arguments || '{}');
                result = await exaSearch(args.query || '', searchKey);
              } catch (e) {}
              msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
            }
            continue;
          }

          finalStatus = status; finalBody = data; break;
        }

        if (!finalBody) finalBody = { error: 'Agent loop: no final response' };
        res.writeHead(finalStatus, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(finalBody));
      } catch (e) {
        res.writeHead(502); res.end(JSON.stringify({ error: 'upstream: ' + e.message }));
      }
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log('  世界杯 AI 预测器已启动');
  console.log('  请在浏览器打开: http://localhost:' + PORT);
  console.log('  关闭此窗口即可停止服务');
  console.log('========================================');
});
