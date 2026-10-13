// WhatsApp channel — NOT IMPLEMENTED YET.
// Options: Twilio WhatsApp API, or Meta WhatsApp Cloud API. Both are plain HTTPS
// calls, so Node's built-in fetch is enough (no extra packages). Twilio example:
//
//   const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
//   await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
//     method: 'POST',
//     headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
//     body: new URLSearchParams({ From: `whatsapp:${cfg.from}`, To: `whatsapp:${cfg.to}`, Body: `*${title}*\n${body}` }),
//   });
//
// Inbound: point the provider's webhook at POST /api/webhooks/whatsapp
// (needs the server reachable from the internet, e.g. deployed or via a tunnel).
module.exports = {
  name: 'whatsapp',
  isConfigured: (cfg) => !!(cfg.to && cfg.from && cfg.accountSid && cfg.authToken),
  async send(message, cfg) {
    throw new Error('WhatsApp channel not implemented yet (see src/notifications/channels/whatsapp.js)');
  },
  // Example of turning a reply like "done gym" into an action.
  async handleInbound(body, { store }) {
    const text = String(body.Body || body.text || '').trim();
    const m = text.match(/^done\s+(.+)$/i);
    if (!m) return { ok: false, reply: 'Try: done <goal name>' };
    const goal = store.allGoals().find((g) => g.title.toLowerCase().includes(m[1].toLowerCase()));
    if (!goal) return { ok: false, reply: `No goal matching "${m[1]}"` };
    store.toggleGoal(goal.id);
    return { ok: true, reply: `Toggled "${goal.title}"` };
  },
};
