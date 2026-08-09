const CACHE_NAME = '90days-tracker-cache-v6';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ব্যাকগ্রাউন্ড মেসেজ রিসিভার
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const title = event.data.title || '90days - রিমাইন্ডার';
    const options = {
      body: event.data.message || 'আজকের দিনের চ্যালেঞ্জ সম্পূর্ণ করেছেন?',
      icon: 'https://onlinecdndrive.vercel.app/90dayslogo.png',
      badge: 'https://onlinecdndrive.vercel.app/90dayslogo.png',
      tag: '90days-reminder',
      renotify: true,
      vibrate: [200, 100, 200]
    };
    self.registration.showNotification(title, options);
  }
});

// নোটিফিকেশনে ক্লিক ইভেন্ট
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
        return clients.openWindow('./');
      }
    })
  );
});