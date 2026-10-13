// Email channel — NOT IMPLEMENTED YET.
// Suggested implementation: `npm install nodemailer`, then:
//
//   const nodemailer = require('nodemailer');
//   const t = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, auth: { user: cfg.smtp.user, pass: cfg.smtp.pass } });
//   await t.sendMail({ from: cfg.smtp.user, to: cfg.to, subject: title, text: body });
//
// For Gmail use an "App password" (Google Account → Security → App passwords).
module.exports = {
  name: 'email',
  isConfigured: (cfg) => !!(cfg.to && cfg.smtp && cfg.smtp.host),
  async send(message, cfg) {
    throw new Error('Email channel not implemented yet (see src/notifications/channels/email.js)');
  },
};
