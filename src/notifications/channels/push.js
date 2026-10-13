// Browser push channel — NOT IMPLEMENTED YET.
// Suggested implementation: `npm install web-push`, generate VAPID keys
// (npx web-push generate-vapid-keys), add a service worker in public/ that
// subscribes, store subscriptions via a new /api/push/subscribe route, then:
//
//   webpush.setVapidDetails('mailto:you@example.com', cfg.vapidPublicKey, cfg.vapidPrivateKey);
//   await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
module.exports = {
  name: 'push',
  isConfigured: (cfg) => !!(cfg.vapidPublicKey && cfg.vapidPrivateKey),
  async send(message, cfg) {
    throw new Error('Push channel not implemented yet (see src/notifications/channels/push.js)');
  },
};
