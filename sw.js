const CACHE_NAME = '90days-tracker-cache-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ব্যাকগ্রাউন্ডে অ্যালার্ম ও নোটিফিকেশন হ্যান্ডলিং
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, message, time } = event.data;
    
    // স্থানীয় তথ্য সেভ রাখা
    self.targetNotifTime = time;
    self.targetNotifTitle = title;
    self.targetNotifMsg = message;
  }
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    showBgNotification(event.data.title, event.data.message);
  }
});

function showBgNotification(title, message) {
  const options = {
    body: message || 'আজকের দিনের চ্যালেঞ্জ সম্পূর্ণ করেছেন?',
    icon: 'https://onlinecdndrive.vercel.app/90dayslogo.png',
    badge: 'https://onlinecdndrive.vercel.app/90dayslogo.png',
    tag: '90days-daily-reminder',
    renotify: true,
    vibrate: [200, 100, 200]
  };
  
  self.registration.showNotification(title || '90days - রিমাইন্ডার', options);
}

// নোটিফিকেশনে ক্লিক করলে অ্যাপ খোলার লজিক
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