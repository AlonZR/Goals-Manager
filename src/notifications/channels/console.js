// Prints notifications to the server terminal. Always available — useful for testing routes.
module.exports = {
  name: 'console',
  isConfigured: () => true,
  async send({ title, body }) {
    console.log(`[${new Date().toLocaleTimeString()}] 🔔 ${title}${body ? ' — ' + body : ''}`);
  },
};
