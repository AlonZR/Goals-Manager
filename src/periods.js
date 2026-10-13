// Period helpers. Every goal lives in an interval (daily/weekly/monthly/yearly);
// each interval is split into periods identified by a sortable string key:
//   daily   -> "2026-10-13"
//   weekly  -> "2026-W42"   (ISO week, Monday-Sunday)
//   monthly -> "2026-10"
//   yearly  -> "2026"

const INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'];

const pad = (n) => String(n).padStart(2, '0');

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function periodKey(interval, date = new Date()) {
  const y = date.getFullYear();
  switch (interval) {
    case 'daily': return `${y}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    case 'weekly': { const w = isoWeek(date); return `${w.year}-W${pad(w.week)}`; }
    case 'monthly': return `${y}-${pad(date.getMonth() + 1)}`;
    case 'yearly': return `${y}`;
    default: throw new Error(`Unknown interval: ${interval}`);
  }
}

function currentPeriods(date = new Date()) {
  return Object.fromEntries(INTERVALS.map((i) => [i, periodKey(i, date)]));
}

// Step one period back (used for streaks).
function previousPeriodDate(interval, date) {
  const d = new Date(date);
  if (interval === 'daily') d.setDate(d.getDate() - 1);
  else if (interval === 'weekly') d.setDate(d.getDate() - 7);
  else if (interval === 'monthly') d.setMonth(d.getMonth() - 1, 1);
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() - 1, 0, 1);
  return d;
}

// Consecutive completed periods ending now (current period counts if done,
// otherwise counting starts from the previous period so a streak isn't "broken"
// before the current period is over).
function streak(interval, completions, now = new Date()) {
  const set = new Set(completions || []);
  let d = new Date(now);
  if (!set.has(periodKey(interval, d))) d = previousPeriodDate(interval, d);
  let count = 0;
  while (set.has(periodKey(interval, d)) && count < 10000) {
    count++;
    d = previousPeriodDate(interval, d);
  }
  return count;
}

function periodLabel(interval, date = new Date()) {
  const opts = { daily: { weekday: 'short', day: 'numeric', month: 'short' }, monthly: { month: 'long', year: 'numeric' } };
  if (interval === 'daily' || interval === 'monthly') return date.toLocaleDateString('en-GB', opts[interval]);
  if (interval === 'weekly') return `Week ${isoWeek(date).week}`;
  return String(date.getFullYear());
}

module.exports = { INTERVALS, periodKey, currentPeriods, streak, periodLabel };
