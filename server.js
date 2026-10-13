// MyGoals server — plain Node.js (v18+).
// Local:   node server.js  (or start.bat)  then open http://localhost:3000
// Online:  set DATABASE_URL + Google sign-in env vars (see README / render.yaml)

const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./src/store');
const auth = require('./src/auth');
const config = require('./src/config');
const notifications = require('./src/notifications');
const scheduler = require('./src/scheduler');

const PORT = Number(process.env.PORT) || config.port || 3000;
const HOST = process.env.HOST || config.host || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// ---------- tiny router ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/state', () => store.getState());
route('GET', '/api/me', (p, b, req) => ({ authEnabled: auth.enabled, email: req.user ? req.user.email : null }));
route('POST', '/api/import', (p, body) => store.importData(body));
route('GET', '/api/archive', () => store.getArchive());

route('POST', '/api/subjects', (p, body) => store.createSubject(body));
route('PATCH', '/api/subjects/:id', (p, body) => store.updateSubject(p.id, body));
route('DELETE', '/api/subjects/:id', (p) => store.deleteSubject(p.id));

route('POST', '/api/goals', (p, body) => store.createGoal(body));
route('POST', '/api/goals/restore', (p, body) => store.restoreGoal(body));
route('PATCH', '/api/goals/:id', (p, body) => store.updateGoal(p.id, body));
route('POST', '/api/goals/:id/toggle', (p) => store.toggleGoal(p.id));
route('DELETE', '/api/goals/:id', (p) => store.deleteGoal(p.id));

// Notification channels: list + send a test message (handy when wiring up WhatsApp/email later)
route('GET', '/api/notifications/channels', () => notifications.listChannels());
route('POST', '/api/notifications/test', (p, body) => notifications.send({ title: 'MyGoals test', body: body.message || 'Test notification from MyGoals' }, body.channel));

// Inbound webhooks (e.g. WhatsApp replies like "done gym") will be routed here later.
route('POST', '/api/webhooks/:channel', (p, body) => notifications.handleInbound(p.channel, body));

// ---------- server ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj ?? {}));
}

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.png' ? 'max-age=86400' : 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  if (pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  try {
    if (await auth.handle(req, res, url)) return;
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: 'Sign-in error' });
  }
  if (pathname === '/api/export' && req.method === 'GET') {
    const name = `mygoals-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(store.exportData(), null, 2));
  }
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  for (const r of routes) {
    const m = r.method === req.method && pathname.match(r.re);
    if (!m) continue;
    try {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      return sendJson(res, 200, await r.handler(params, body, req));
    } catch (e) {
      if (!e.status) console.error(e);
      return sendJson(res, e.status || 500, { error: e.message });
    }
  }
  sendJson(res, 404, { error: 'Not found' });
});

async function main() {
  await store.init();
  notifications.init();
  scheduler.start();
  server.listen(PORT, HOST, () => {
    console.log(`\n  MyGoals is running →  http://localhost:${PORT}`);
    console.log(`  storage: ${require('./src/persistence').name} · sign-in: ${auth.enabled ? 'Google' : 'off (local)'}\n`);
  });
}

// Make sure the last change is saved before the host stops the app.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    server.close();
    try { await store.flush(); } finally { process.exit(0); }
  });
}

main().catch((e) => { console.error('Failed to start:', e.message); process.exit(1); });
