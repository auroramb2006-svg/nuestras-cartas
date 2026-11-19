// Service worker: muestra las notificaciones, abre la app al tocarlas y renueva la suscripción si el móvil la cambia.
const API = 'https://nuestrascartas.vercel.app/api/push';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Nuestras cartas', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Nuestras cartas', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [80, 40, 80],
    timestamp: Date.now(),
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const base = url.split('?')[0];
    for (const c of list) {
      if (c.url.split('?')[0] === base && 'focus' in c) { if (url !== c.url && 'navigate' in c) c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

// Algunos móviles caducan la suscripción por su cuenta: nos suscribimos otra vez y avisamos al servidor.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    const key = old && old.options && old.options.applicationServerKey;
    let sub = e.newSubscription;
    if (!sub && key) sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    if (sub && old) await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resub', old: old.endpoint, sub: sub.toJSON() }) });
  })());
});
