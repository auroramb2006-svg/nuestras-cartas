const test = require('node:test');
const assert = require('node:assert/strict');
const Auth = require('../api/_admin_auth.js');
const editorAuth = require('../api/editor-auth.js');

process.env.EDITOR_LOGIN_PASSWORD = 'A-long-editor-password!';
process.env.EDITOR_SESSION_SECRET = 'a'.repeat(64);

test('editor password comparison rejects incorrect values', () => {
  assert.equal(Auth.verifyPassword('A-long-editor-password!'), true);
  assert.equal(Auth.verifyPassword('wrong'), false);
  assert.equal(Auth.isConfigured(), true);
});

test('signed sessions expire and reject tampering', () => {
  const now = Date.now();
  const session = Auth.createSession(now);
  assert.equal(Auth.validSession(session, now), true);
  assert.equal(Auth.validSession(session, now + Auth.SESSION_SECONDS * 1000 + 1), false);
  assert.equal(Auth.validSession(session + 'x', now), false);
});

test('admin access requires a valid token and the configured editor origin', () => {
  const session = Auth.createSession();
  const req = {
    headers: {
      authorization: `Bearer ${session}`,
      host: 'nuestrascartas.vercel.app',
      origin: Auth.DEFAULT_EDITOR_ORIGIN,
    },
  };
  assert.equal(Auth.isAdmin(req), true);
  req.headers.origin = 'https://attacker.example';
  assert.equal(Auth.isAdmin(req), false);
  req.headers.origin = 'http://nuestrascartas.vercel.app';
  assert.equal(Auth.isAdmin(req), false);
});

test('CORS is allowed only for the editor origin', () => {
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value } };
  Auth.setCors({ headers: { origin: Auth.DEFAULT_EDITOR_ORIGIN } }, res);
  assert.equal(headers['Access-Control-Allow-Origin'], Auth.DEFAULT_EDITOR_ORIGIN);
  const deniedHeaders = {};
  Auth.setCors({ headers: { origin: 'https://attacker.example' } }, { setHeader(name, value) { deniedHeaders[name] = value } });
  assert.equal(deniedHeaders['Access-Control-Allow-Origin'], undefined);
});

test('editor login creates a signed token that the session endpoint accepts', async () => {
  const headers = {};
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    end() { return this },
  };
  const origin = Auth.DEFAULT_EDITOR_ORIGIN;
  await editorAuth({
    method: 'POST',
    headers: { host: 'nuestrascartas.vercel.app', origin },
    body: { action: 'login', password: 'A-long-editor-password!' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(Auth.validSession(response.body.token), true);
  assert.equal(headers['Access-Control-Allow-Origin'], origin);

  const sessionResponse = { ...response, statusCode: 200, body: undefined };
  await editorAuth({
    method: 'POST',
    headers: {
      host: 'nuestrascartas.vercel.app',
      origin,
      authorization: `Bearer ${response.body.token}`,
    },
    body: { action: 'session' },
  }, sessionResponse);
  assert.deepEqual(sessionResponse.body, { authenticated: true });
});
