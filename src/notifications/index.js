// Notification hub.
// - Listens to domain events on the bus and forwards them to the channels
//   configured in config.notifications.routes.
// - Each channel lives in ./channels/<name>.js and exports:
//       { name, isConfigured(cfg) -> bool, send(message, cfg) -> Promise, handleInbound?(body, ctx) }
//   where message = { title, body, goal?, event? }
//
// Adding WhatsApp later = fill in channels/whatsapp.js, set enabled:true in
// config.json and add "whatsapp" to the routes you want. Nothing else changes.

const fs = require('fs');
const path = require('path');
const bus = require('../events');
const config = require('../config');
const store = require('../store');

const channels = {};
for (const f of fs.readdirSync(path.join(__dirname, 'channels'))) {
  if (!f.endsWith('.js')) continue;
  const ch = require(path.join(__dirname, 'channels', f));
  channels[ch.name] = ch;
}

const cfgFor = (name) => config.notifications.channels[name] || {};
const isActive = (name) => channels[name] && cfgFor(name).enabled && channels[name].isConfigured(cfgFor(name));

async function send(message, only) {
  const targets = only ? [only] : Object.keys(channels);
  const results = {};
  for (const name of targets) {
    if (!isActive(name)) { results[name] = 'skipped (disabled or not configured)'; continue; }
    try { await channels[name].send(message, cfgFor(name)); results[name] = 'sent'; }
    catch (e) { results[name] = `error: ${e.message}`; console.error(`[notify:${name}]`, e.message); }
  }
  return results;
}

async function dispatch(eventName, message) {
  const names = config.notifications.routes[eventName] || [];
  for (const name of names) if (isActive(name)) await send({ ...message, event: eventName }, name);
}

const subjectName = (id) => (store.allSubjects().find((s) => s.id === id) || {}).name || '';

function init() {
  bus.on('goal.completed', ({ goal }) =>
    dispatch('goal.completed', { title: 'Goal completed ✔', body: `${goal.title} (${subjectName(goal.subjectId)}, ${goal.interval})`, goal }));
  bus.on('goal.rolled', ({ goal, toPeriod }) =>
    dispatch('goal.rolled', { title: 'Goal carried over', body: `${goal.title} moved to ${toPeriod}`, goal }));
  bus.on('period.started', ({ interval, periodKey }) =>
    dispatch('period.started', { title: `New ${interval} period`, body: periodKey }));
}

// Called by the scheduler for reminder digests.
function remind(message) { return dispatch('reminder', message); }

function listChannels() {
  return Object.keys(channels).map((name) => ({ name, enabled: !!cfgFor(name).enabled, configured: channels[name].isConfigured(cfgFor(name)), inbound: !!channels[name].handleInbound }));
}

// Inbound messages (e.g. replying "done gym" on WhatsApp) — channels translate them into store actions.
async function handleInbound(name, body) {
  const ch = channels[name];
  if (!ch || !ch.handleInbound) { const e = new Error('Channel has no inbound handler'); e.status = 404; throw e; }
  // Webhooks are reachable without signing in, so only accept them for an enabled channel.
  // When implementing one, also verify the provider's request signature in its handleInbound().
  if (!isActive(name)) { const e = new Error('Channel not enabled'); e.status = 404; throw e; }
  return ch.handleInbound(body, { store, config: cfgFor(name) });
}

module.exports = { init, send, remind, listChannels, handleInbound };
