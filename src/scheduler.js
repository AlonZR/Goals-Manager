// Runs every 30 seconds:
//  - rolls periods over (new day/week/...), which auto-carries unfinished one-off goals
//  - fires reminder digests at the times set in config.reminders

const store = require('./store');
const config = require('./config');
const notifications = require('./notifications');
const { periodKey } = require('./periods');

const fired = new Set(); // "2026-10-13 08:00" — avoid double-firing within a minute

function openGoalsDigest(intervals) {
  const state = store.getState();
  const subjects = Object.fromEntries(state.subjects.map((s) => [s.id, s.name]));
  const open = state.goals.filter((g) => intervals.includes(g.interval) && !g.doneNow);
  if (!open.length) return 'All done 🎉';
  return open.map((g) => `• ${g.title} (${subjects[g.subjectId]})`).join('\n');
}

function tick(date = new Date()) {
  store.refreshPeriods(date);
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  for (const r of config.reminders || []) {
    const key = `${periodKey('daily', date)} ${r.time}`;
    if (r.time === hhmm && !fired.has(key)) {
      fired.add(key);
      notifications.remind({ title: r.message || 'Goals reminder', body: openGoalsDigest(r.intervals || ['daily']) });
    }
  }
}

function start() {
  tick();
  setInterval(() => { try { tick(); } catch (e) { console.error('[scheduler]', e); } }, 30 * 1000);
}

module.exports = { start, tick };
