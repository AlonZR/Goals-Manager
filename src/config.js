// Loads config.json (if present) on top of sensible defaults.
// Secrets for future channels (WhatsApp token, SMTP password...) should go in
// config.json or environment variables — config.json is git-ignored.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  port: 3000,
  host: '127.0.0.1',
  notifications: {
    // Which channels receive which events. Add "whatsapp", "email", "push" once configured.
    routes: {
      'goal.completed': ['console'],
      'goal.rolled': [],
      'period.started': ['console'],
      reminder: ['console'],
    },
    channels: {
      console: { enabled: true },
      email: { enabled: false, to: '', smtp: { host: '', port: 587, user: '', pass: '' } },
      whatsapp: { enabled: false, provider: 'twilio', to: '', accountSid: '', authToken: '', from: '' },
      push: { enabled: false, vapidPublicKey: '', vapidPrivateKey: '' },
    },
  },
  // Scheduled reminders (24h local time). Each sends a digest of what's still open.
  reminders: [
    { time: '08:00', intervals: ['daily'], message: 'Good morning! Today\'s goals' },
    { time: '21:00', intervals: ['daily'], message: 'Still open today' },
  ],
};

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over) || typeof over !== 'object' || over === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

const file = path.join(__dirname, '..', 'config.json');
let user = {};
if (fs.existsSync(file)) {
  try { user = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('config.json is invalid JSON:', e.message); }
}

module.exports = deepMerge(DEFAULTS, user);
