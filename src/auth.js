// Google sign-in (OAuth 2.0 authorization-code flow) with a signed session cookie.
// Enabled only when GOOGLE_CLIENT_ID is set — locally the app stays open as before.
//
// Env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  from Google Cloud Console (OAuth client, type "Web application")
//   BASE_URL         public address, e.g. https://mygoals.onrender.com  (redirect URI = BASE_URL/auth/google/callback)
//                    — on Render this defaults to RENDER_EXTERNAL_URL automatically
//   REQUIRE_AUTH     "true" = refuse to start without Google sign-in configured (set online)
//   ALLOWED_EMAILS   comma-separated Google accounts allowed in
//   SESSION_SECRET   long random string used to sign cookies

const crypto = require('crypto');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const ALLOWED = (process.env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const SECRET = process.env.SESSION_SECRET || '';
const SESSION_DAYS = 180;
const COOKIE = 'mg_session';

const enabled = !!CLIENT_ID;

if (!enabled && process.env.REQUIRE_AUTH === 'true') {
  throw new Error('REQUIRE_AUTH is set but GOOGLE_CLIENT_ID is missing — refusing to start an unprotected app');
}

if (enabled) {
  const missing = [];
  if (!CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!BASE_URL) missing.push('BASE_URL');
  if (!ALLOWED.length) missing.push('ALLOWED_EMAILS');
  if (SECRET.length < 32) missing.push('SESSION_SECRET (32+ chars)');
  if (missing.length) throw new Error(`Google sign-in is enabled but these settings are missing: ${missing.join(', ')}`);
}

const secure = BASE_URL.startsWith('https://');
const redirectUri = `${BASE_URL}/auth/google/callback`;

// ---------- cookies ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function makeSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readSession(req) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (s.exp < Date.now() || !ALLOWED.includes(String(s.email).toLowerCase())) return null;
    return s;
  } catch { return null; }
}

// ---------- routes ----------
function redirect(res, location, cookies = []) {
  res.writeHead(302, { Location: location, 'Set-Cookie': cookies, 'Cache-Control': 'no-store' });
  res.end();
}

function startLogin(req, res) {
  const state = crypto.randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  });
  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`, [cookie('mg_oauth_state', state, 600)]);
}

async function callback(req, res, url) {
  const fail = (reason) => redirect(res, `/login.html?error=${reason}`, [cookie('mg_oauth_state', '', 0)]);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!code || !state || state !== parseCookies(req).mg_oauth_state) return fail('state');

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await r.json();
    if (!r.ok || !tokens.id_token) { console.error('[auth] token exchange failed', tokens.error); return fail('google'); }
    // The ID token came straight from Google over HTTPS, so its claims can be trusted without re-verifying the signature.
    const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
    const email = String(claims.email || '').toLowerCase();
    if (claims.aud !== CLIENT_ID || !claims.email_verified || !ALLOWED.includes(email)) {
      console.warn(`[auth] refused sign-in for ${email || 'unknown account'}`);
      return fail('not_allowed');
    }
    redirect(res, '/', [cookie(COOKIE, makeSession(email), SESSION_DAYS * 86400), cookie('mg_oauth_state', '', 0)]);
  } catch (e) {
    console.error('[auth]', e);
    fail('google');
  }
}

function logout(req, res) {
  redirect(res, '/login.html', [cookie(COOKIE, '', 0)]);
}

// Paths reachable without signing in.
const PUBLIC = new Set(['/login.html', '/styles.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/healthz']);

/**
 * Returns true if the request was fully handled here (auth route or rejection).
 * Otherwise sets req.user and lets the app continue.
 */
async function handle(req, res, url) {
  const p = url.pathname;
  if (!enabled) { req.user = null; return false; }

  if (p === '/auth/google') { startLogin(req, res); return true; }
  if (p === '/auth/google/callback') { await callback(req, res, url); return true; }
  if (p === '/auth/logout') { logout(req, res); return true; }
  if (PUBLIC.has(p) || p.startsWith('/api/webhooks/')) return false;

  const session = readSession(req);
  if (session) { req.user = { email: session.email }; return false; }

  if (p.startsWith('/api/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not signed in' }));
  } else {
    redirect(res, '/login.html');
  }
  return true;
}

module.exports = { enabled, handle };
