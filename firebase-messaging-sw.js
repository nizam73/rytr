// firebase-messaging-sw.js
// Must be at the ROOT of your site (same level as index.html)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCMVpe1C0YNP1J_o0k22Ld_l5v2BzFP2xA",
  authDomain:        "rytr-105a3.firebaseapp.com",
  projectId:         "rytr-105a3",
  storageBucket:     "rytr-105a3.firebasestorage.app",
  messagingSenderId: "76786224478",
  appId:             "1:76786224478:web:fc673130160534dae953cf"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Rytr', {
    body:  body  || 'You have a new message',
    icon:  icon  || '/icon-192.png',
    badge: '/icon-192.png',
    tag:   payload.data?.chatId || 'rytr-msg',  // groups notifications per chat
    data:  payload.data || {},
    actions: [{ action: 'open', title: 'Open Chat' }]
  });
});

// Click on notification → open the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const url    = chatId
    ? `${self.location.origin}/chat.html`
    : `${self.location.origin}/chat.html`;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const client of list) {
        if(client.url.includes('/chat.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
