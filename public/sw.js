// ASTRA Service Worker - Handles background push notifications (FCM)
const APP_NAME = 'ASTRA Solar Kart';

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(clients.claim());
});

// Handle FCM push messages when app is closed/in background
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let title = APP_NAME;
  let body = 'You have a new notification';
  let icon = '/favicon.ico';
  let badge = '/favicon.ico';
  let data = {};

  if (event.data) {
    try {
      const payload = event.data.json();
      // Handle FCM notification payload format
      if (payload.notification) {
        title = payload.notification.title || title;
        body = payload.notification.body || body;
      }
      // Handle FCM data payload
      if (payload.data) {
        data = payload.data;
        if (payload.data.title) title = payload.data.title;
        if (payload.data.body) body = payload.data.body;
      }
    } catch (e) {
      // Try text format
      try {
        body = event.data.text();
      } catch (e2) {
        console.warn('[SW] Could not parse push data');
      }
    }
  }

  const options = {
    body,
    icon,
    badge,
    vibrate: [200, 100, 200, 100, 200],
    tag: `astra-push-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click - focus or open the app
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find an existing open window for this origin
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // No window open - open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});
