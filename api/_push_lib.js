// Utilidades compartidas para las notificaciones (claves, suscripciones y envío).
const { put, get, list, del } = require('@vercel/blob');
const webpush = require('web-push');
const ACCESS = ['private', 'public'];
const SUBS = 'push/subs/';

async function readJSON(pathname) {
  for (const access of ACCESS) {
    try { const r = await get(pathname, { access, useCache: false }); if (r && r.stream) return JSON.parse(await new Response(r.stream).text()); } catch (e) { /* probar la otra forma */ }
  }
  return null;
}
async function writeJSON(pathname, obj) {
  let last;
  for (const access of ACCESS) {
    try { await put(pathname, JSON.stringify(obj), { access, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 }); return; } catch (e) { last = e; }
  }
  throw last;
}
// Las claves VAPID se crean solas la primera vez y se guardan en el almacén privado.
async function vapid() {
  let k = await readJSON('push/vapid.json');
  if (!k || !k.publicKey || !k.privateKey) { k = webpush.generateVAPIDKeys(); await writeJSON('push/vapid.json', k); }
  webpush.setVapidDetails('mailto:avisos@nuestrascartas.app', k.publicKey, k.privateKey);
  return k;
}
function subId(endpoint) { let h = 2166136261; for (const c of Buffer.from(String(endpoint))) { h ^= c; h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
async function allSubs() {
  const out = []; let cursor;
  do {
    const r = await list({ prefix: SUBS, limit: 200, cursor });
    for (const b of r.blobs || []) { const o = await readJSON(b.pathname); if (o && o.sub) { o._path = b.pathname; out.push(o); } }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
// Envía y borra las suscripciones que ya no existen (móvil desinstalado, permiso quitado…).
async function send(rec, payload, urgency) {
  // urgency 'high' = que el móvil no lo retrase (avisos al momento)
  try { await webpush.sendNotification(rec.sub, JSON.stringify(payload), { TTL: urgency === 'high' ? 60 * 60 * 6 : 60 * 60 * 20, urgency: urgency || 'normal' }); return true; }
  catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) { try { await del(rec._path || (SUBS + subId(rec.sub.endpoint) + '.json')); } catch (x) {} }
    return false;
  }
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const t = typeof req.body === 'string' ? req.body : await new Promise((ok, ko) => { let d = ''; req.on('data', c => { d += c; if (d.length > 200000) ko(new Error('big')); }); req.on('end', () => ok(d)); req.on('error', ko); });
  return JSON.parse(t || '{}');
}
const clip = (s, n) => String(s || '').slice(0, n);
async function listAll(prefix) {
  const out = []; let cursor;
  do { const r = await list({ prefix, limit: 1000, cursor }); out.push(...(r.blobs || [])); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}
module.exports = { listAll, readJSON, writeJSON, vapid, subId, allSubs, send, readBody, clip, SUBS };
