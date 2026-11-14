/**
 * CF Worker 多功能骨架（免费版可跑）
 *
 *   GET  /                      状态页 / 出口 IP 信息
 *   GET  /proxy?url=<目标URL>   反向代理（已放开 CORS，可当 API 中转）
 *   POST /shorten  {url}        生成短链（需要 KV 绑定 SHORT）
 *   GET  /s/<key>               跳转
 *   GET  /ip                    纯 JSON 版的出口信息
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400',
};

// 这些段在 Workers 侧走不通，提前挡掉，省一次超时
const PRIVATE = [
  /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./, /^0\./, /^\[?::1\]?$/, /^\[?fc/, /^\[?fe80/,
];

function isPrivate(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '');
  return PRIVATE.some((re) => re.test(h));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** 反代：纯转发不 buffer，CPU 时间接近 0 */
async function proxy(request, env) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'missing ?url=' }, 400);

  let dst;
  try {
    dst = new URL(target);
  } catch {
    return json({ error: 'bad url' }, 400);
  }
  if (!/^https?:$/.test(dst.protocol)) return json({ error: 'only http(s)' }, 400);
  if (isPrivate(dst.hostname)) return json({ error: 'private host blocked' }, 403);

  const allow = (env.PROXY_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.some((d) => dst.hostname === d || dst.hostname.endsWith('.' + d))) {
    return json({ error: 'host not in PROXY_ALLOW', host: dst.hostname }, 403);
  }

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('x-forwarded-for');
  headers.delete('x-real-ip');
  headers.set('host', dst.host);
  if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0');

  const init = { method: request.method, headers, redirect: 'follow' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  let res;
  try {
    res = await fetch(dst.toString(), init);
  } catch (e) {
    return json({ error: 'upstream failed', detail: String(e) }, 502);
  }

  const out = new Headers(res.headers);
  out.delete('content-security-policy');
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');
  out.delete('set-cookie');
  for (const [k, v] of Object.entries(CORS)) out.set(k, v);

  return new Response(res.body, { status: res.status, headers: out });
}

async function shorten(request, env) {
  if (!env.SHORT) return json({ error: 'KV binding SHORT not configured' }, 501);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  try {
    new URL(body.url);
  } catch {
    return json({ error: 'bad url' }, 400);
  }
  const key = (body.key || '').replace(/[^A-Za-z0-9_-]/g, '') ||
    Math.random().toString(36).slice(2, 8);
  await env.SHORT.put(key, body.url);
  return json({ short: `${new URL(request.url).origin}/s/${key}`, key });
}

async function page(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '?';
  const colo = request.cf?.colo || '?';
  const country = request.cf?.country || '?';
  const name = env.SITE_NAME || 'CF Worker';

  const html = `<!doctype html><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>${name}</title>
<style>
  :root{color-scheme:dark}
  body{font:15px/1.7 ui-monospace,Menlo,monospace;margin:0;padding:28px;
       background:#0d1117;color:#c9d1d9;max-width:720px}
  h1{font-size:17px;color:#58a6ff;margin:0 0 18px;font-weight:600}
  table{border-collapse:collapse;width:100%;margin:0 0 22px}
  td{padding:5px 0;border-bottom:1px solid #21262d}
  td:first-child{color:#8b949e;width:130px}
  code{background:#161b22;padding:2px 6px;border-radius:4px;color:#79c0ff}
  .ok{color:#3fb950}
  ul{padding-left:18px;color:#8b949e}
  li b{color:#c9d1d9;font-weight:500}
</style>
<h1>${name} <span class="ok">&#9679; online</span></h1>
<table>
  <tr><td>出口 IP</td><td><code>${ip}</code></td></tr>
  <tr><td>机房</td><td>${colo}</td></tr>
  <tr><td>国家</td><td>${country}</td></tr>
  <tr><td>运行时</td><td>workerd / Workers Free</td></tr>
</table>
<ul>
  <li><b>反代</b> <code>/proxy?url=https://api.example.com/x</code></li>
  <li><b>短链</b> <code>POST /shorten {"url":"https://..."}</code>${env.SHORT ? '' : '（需绑定 KV：SHORT）'}</li>
  <li><b>JSON</b> <code>/ip</code></li>
</ul>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', ...CORS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (pathname === '/proxy') return proxy(request, env);
    if (pathname === '/shorten' && request.method === 'POST') return shorten(request, env);
    if (pathname.startsWith('/s/')) {
      if (!env.SHORT) return json({ error: 'KV not configured' }, 501);
      const dest = await env.SHORT.get(pathname.slice(3));
      if (!dest) return json({ error: 'not found' }, 404);
      return Response.redirect(dest, 302);
    }
    if (pathname === '/ip') {
      return json({
        ip: request.headers.get('cf-connecting-ip'),
        colo: request.cf?.colo,
        country: request.cf?.country,
        city: request.cf?.city,
        asn: request.cf?.asn,
        tls: request.cf?.tlsVersion,
        http: request.cf?.httpProtocol,
      });
    }
    return page(request, env);
  },
};
