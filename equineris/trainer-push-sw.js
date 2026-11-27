'use strict';
const destination = new URL('trainer-dashboard.html', self.registration.scope).href;
self.addEventListener('push', event => {
  let test = false;
  try { test = event.data?.json()?.test === true; } catch (_) {}
  event.waitUntil(self.registration.showNotification('EQUINERIS', {
    body: test ? 'テスト通知が届きました。' : '新しい食事確認依頼が届きました。タップして確認してください。'
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({type:'window', includeUncontrolled:true})) {
      if (client.url === destination) return client.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
