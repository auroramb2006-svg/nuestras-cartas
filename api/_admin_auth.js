const crypto = require('crypto');

const SESSION_SECONDS = 8 * 60 * 60;
const DEFAULT_EDITOR_ORIGIN = 'https://editor-aurora-81d3.vercel.app';

function editorOrigin() {
  return String(process.env.EDITOR_ORIGIN || DEFAULT_EDITOR_ORIGIN).replace(/\/+$/, '');
}

function isConfigured() {
  return String(process.env.EDITOR_LOGIN_PASSWORD || '').length >= 16
    && String(process.env.EDITOR_SESSION_SECRET || '').length >= 32;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (origin === editorOrigin()) return true;
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return origin === `${protocol}://${req.headers.host}`;
}

function setCors(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.origin !== editorOrigin()) return;
  res.setHeader('Access-Control-Allow-Origin', editorOrigin());
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
}

function verifyPassword(password) {
  const expected = String(process.env.EDITOR_LOGIN_PASSWORD || '');
  const supplied = crypto.createHash('sha256').update(String(password || '')).digest();
  const configured = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(supplied, configured);
}

function signature(value) {
  return crypto.createHmac('sha256', process.env.EDITOR_SESSION_SECRET).update(value).digest('base64url');
}

function createSession(now = Date.now(), nonce = crypto.randomBytes(18).toString('base64url')) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${nonce}`;
  return `${payload}.${signature(payload)}`;
}

function validSession(token, now = Date.now()) {
  if (!isConfigured() || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{20,}$/.test(parts[1])) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(payload));
  const supplied = Buffer.from(parts[2]);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return false;
  return Number(parts[0]) > Math.floor(now / 1000);
}

function sessionFromRequest(req) {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers.authorization || ''));
  return match ? match[1] : '';
}

function isAdmin(req) {
  return isAllowedOrigin(req) && validSession(sessionFromRequest(req));
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.status(401).json({ error: 'auth' });
  return false;
}

module.exports = {
  SESSION_SECONDS,
  DEFAULT_EDITOR_ORIGIN,
  editorOrigin,
  isConfigured,
  isAllowedOrigin,
  setCors,
  verifyPassword,
  createSession,
  validSession,
  sessionFromRequest,
  isAdmin,
  requireAdmin,
};
