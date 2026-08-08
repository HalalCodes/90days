const CACHE_NAME = '90days-tracker-cache-v3';

// ইনস্টলেশন ও ক্যাশিং
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// সক্রিয়করণ
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// নোটিফিকেশনে ক্লিক করার পর অ্যাপ ওপেন করার লজিক
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});
