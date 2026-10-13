// Data store backed by a single JSON file (data/goals.json).
// All reads/writes go through this module, so swapping to SQLite or a cloud
// database later only means re-implementing these functions.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bus = require('./events');
const { INTERVALS, periodKey, currentPeriods, streak } = require('./periods');

const DATA_DIR = process.env.MYGOALS_DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'goals.json');

const DEFAULT_SUBJECTS = [
  { name: 'Personal', color: '#7c5cff' },
  { name: 'Relationship', color: '#e85d8f' },
  { name: 'Education', color: '#2f9e8f' },
  { name: 'Work', color: '#3b82f6' },
  { name: 'House', color: '#e89b2f' },
];

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

let db = null;

function load() {
  if (db) return db;
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    db = {
      version: 1,
      subjects: DEFAULT_SUBJECTS.map((s, i) => ({ id: id(), ...s, order: i, createdAt: now() })),
      goals: [],
      meta: { lastPeriods: currentPeriods() },
    };
    save();
  }
  db.meta = db.meta || { lastPeriods: currentPeriods() };
  return db;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic replace, no half-written file
}

// ---------- period maintenance ----------

// Called before every read and once a minute by the scheduler:
// - emits period.started when a new day/week/month/year begins
// - auto-rolls unfinished one-off goals into the current period
function refreshPeriods(date = new Date()) {
  load();
  const cur = currentPeriods(date);
  let changed = false;

  for (const interval of INTERVALS) {
    if (db.meta.lastPeriods[interval] !== cur[interval]) {
      db.meta.lastPeriods[interval] = cur[interval];
      changed = true;
      bus.emit('period.started', { interval, periodKey: cur[interval] });
    }
  }

  for (const g of db.goals) {
    if (g.recurring || g.done) continue;
    const target = cur[g.interval];
    if (g.periodKey < target) {
      const fromPeriod = g.periodKey;
      g.periodKey = target;
      g.rolledCount = (g.rolledCount || 0) + 1;
      changed = true;
      bus.emit('goal.rolled', { goal: g, fromPeriod, toPeriod: target });
    }
  }
  if (changed) save();
}

// ---------- views ----------

function decorate(g, cur, date) {
  const pk = cur[g.interval];
  if (g.recurring) {
    return { ...g, doneNow: (g.completions || []).includes(pk), streak: streak(g.interval, g.completions, date) };
  }
  return { ...g, doneNow: !!g.done };
}

function getState(date = new Date()) {
  refreshPeriods(date);
  const cur = currentPeriods(date);
  // Completed one-offs from earlier periods are archived (hidden from the board).
  const visible = db.goals.filter((g) => g.recurring || !g.done || g.periodKey >= cur[g.interval]);
  return {
    subjects: [...db.subjects].sort((a, b) => a.order - b.order),
    goals: visible.map((g) => decorate(g, cur, date)).sort((a, b) => a.order - b.order),
    periods: cur,
    archivedCount: db.goals.length - visible.length,
  };
}

function getArchive() {
  load();
  const cur = currentPeriods();
  return db.goals.filter((g) => !g.recurring && g.done && g.periodKey < cur[g.interval]);
}

// ---------- subjects ----------

function createSubject({ name, color }) {
  load();
  if (!name || !name.trim()) throw badRequest('Subject name is required');
  const s = { id: id(), name: name.trim(), color: color || '#888888', order: nextOrder(db.subjects), createdAt: now() };
  db.subjects.push(s);
  save();
  return s;
}

function updateSubject(sid, changes) {
  load();
  const s = findOr404(db.subjects, sid, 'Subject');
  for (const k of ['name', 'color', 'order', 'collapsed']) if (k in changes) s[k] = changes[k];
  save();
  return s;
}

function deleteSubject(sid) {
  load();
  const s = findOr404(db.subjects, sid, 'Subject');
  db.subjects = db.subjects.filter((x) => x.id !== sid);
  const removed = db.goals.filter((g) => g.subjectId === sid);
  db.goals = db.goals.filter((g) => g.subjectId !== sid);
  save();
  removed.forEach((goal) => bus.emit('goal.deleted', { goal }));
  return s;
}

// ---------- goals ----------

function createGoal({ subjectId, title, description = '', interval = 'daily', recurring = false, order }) {
  load();
  if (!title || !title.trim()) throw badRequest('Goal title is required');
  if (!INTERVALS.includes(interval)) throw badRequest('Invalid interval');
  findOr404(db.subjects, subjectId, 'Subject');
  const g = {
    id: id(),
    subjectId,
    title: title.trim(),
    description: String(description || '').trim(),
    interval,
    recurring: !!recurring,
    done: false,
    completedAt: null,
    completions: [],
    periodKey: periodKey(interval),
    rolledCount: 0,
    order: order ?? nextOrder(db.goals),
    createdAt: now(),
  };
  db.goals.push(g);
  save();
  bus.emit('goal.created', { goal: g });
  return g;
}

function updateGoal(gid, changes) {
  load();
  const g = findOr404(db.goals, gid, 'Goal');
  const from = { subjectId: g.subjectId, interval: g.interval };

  if ('title' in changes) {
    if (!changes.title || !changes.title.trim()) throw badRequest('Goal title is required');
    g.title = changes.title.trim();
  }
  if ('description' in changes) g.description = String(changes.description || '').trim();
  if ('subjectId' in changes) { findOr404(db.subjects, changes.subjectId, 'Subject'); g.subjectId = changes.subjectId; }
  if ('interval' in changes && changes.interval !== g.interval) {
    if (!INTERVALS.includes(changes.interval)) throw badRequest('Invalid interval');
    g.interval = changes.interval;
    g.periodKey = periodKey(g.interval); // lands in the current period of the new interval
    g.completions = []; // recurring history doesn't translate between intervals
    if (g.recurring) g.done = false;
  }
  if ('recurring' in changes) {
    g.recurring = !!changes.recurring;
    if (g.recurring) { g.done = false; g.completedAt = null; }
    g.periodKey = periodKey(g.interval);
  }
  if ('order' in changes) g.order = changes.order;
  save();

  bus.emit('goal.updated', { goal: g, changes });
  if (from.subjectId !== g.subjectId || from.interval !== g.interval) {
    bus.emit('goal.moved', { goal: g, from, to: { subjectId: g.subjectId, interval: g.interval } });
  }
  return g;
}

function toggleGoal(gid, date = new Date()) {
  load();
  const g = findOr404(db.goals, gid, 'Goal');
  const pk = periodKey(g.interval, date);
  let completed;
  if (g.recurring) {
    g.completions = g.completions || [];
    completed = !g.completions.includes(pk);
    g.completions = completed ? [...g.completions, pk] : g.completions.filter((k) => k !== pk);
  } else {
    completed = !g.done;
    g.done = completed;
    g.completedAt = completed ? now() : null;
    if (!completed) g.periodKey = pk;
  }
  save();
  bus.emit(completed ? 'goal.completed' : 'goal.uncompleted', { goal: g, periodKey: pk });
  return g;
}

function deleteGoal(gid) {
  load();
  const g = findOr404(db.goals, gid, 'Goal');
  db.goals = db.goals.filter((x) => x.id !== gid);
  save();
  bus.emit('goal.deleted', { goal: g });
  return g;
}

// Restore a previously deleted goal (used by "Undo" in the UI).
function restoreGoal(goal) {
  load();
  if (!goal || !goal.id || db.goals.some((g) => g.id === goal.id)) throw badRequest('Cannot restore goal');
  findOr404(db.subjects, goal.subjectId, 'Subject');
  const { doneNow, streak: _s, ...clean } = goal;
  db.goals.push(clean);
  save();
  bus.emit('goal.created', { goal: clean });
  return clean;
}

// ---------- helpers ----------

function nextOrder(list) {
  return list.reduce((m, x) => Math.max(m, x.order || 0), 0) + 1;
}

function findOr404(list, xid, what) {
  const x = list.find((i) => i.id === xid);
  if (!x) { const e = new Error(`${what} not found`); e.status = 404; throw e; }
  return x;
}

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// Raw access for integrations (e.g. building a reminder digest).
function allGoals() { load(); return db.goals; }
function allSubjects() { load(); return db.subjects; }

module.exports = {
  getState, getArchive, refreshPeriods,
  createSubject, updateSubject, deleteSubject,
  createGoal, updateGoal, toggleGoal, deleteGoal, restoreGoal,
  allGoals, allSubjects,
};
