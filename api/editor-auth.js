const Auth = require('./_admin_auth.js');
const L = require('./_push_lib.js');

module.exports = async (req, res) => {
  Auth.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  if (!Auth.isAllowedOrigin(req)) return res.status(403).json({ error: 'origin' });
  if (!Auth.isConfigured()) return res.status(503).json({ error: 'not_configured' });

  try {
    const body = await L.readBody(req);
    if (body.action === 'session') return res.status(200).json({ authenticated: Auth.isAdmin(req) });
    if (body.action !== 'login') return res.status(400).json({ error: 'action' });
    if (!Auth.verifyPassword(body.password)) return res.status(401).json({ error: 'auth' });

    return res.status(200).json({ token: Auth.createSession(), expiresIn: Auth.SESSION_SECONDS });
  } catch (e) {
    return res.status(400).json({ error: 'bad_request' });
  }
};
