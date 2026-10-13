// Quick self-test of the store and period logic (uses a temp data dir).
const os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
process.env.MYGOALS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mygoals-'));
const store = require('../src/store');
const { periodKey, streak } = require('../src/periods');

assert.strictEqual(periodKey('weekly', new Date(2026, 9, 13)), '2026-W42');
assert.strictEqual(periodKey('weekly', new Date(2027, 0, 1)), '2026-W53');
assert.strictEqual(periodKey('daily', new Date(2026, 0, 5)), '2026-01-05');

const s = store.getState();
assert.strictEqual(s.subjects.length, 5, 'default subjects');
const sid = s.subjects[0].id;

// one-off auto-roll
const g = store.createGoal({ subjectId: sid, title: 'Read book', interval: 'daily' });
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
let st = store.getState(tomorrow);
let rg = st.goals.find((x) => x.id === g.id);
assert.strictEqual(rg.periodKey, periodKey('daily', tomorrow), 'rolled to tomorrow');
assert.strictEqual(rg.rolledCount, 1);

// done one-off archived after its period
store.toggleGoal(g.id, tomorrow);
const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);
st = store.getState(dayAfter);
assert.ok(!st.goals.find((x) => x.id === g.id), 'archived after period ends');

// recurring + streak
const r = store.createGoal({ subjectId: sid, title: 'Gym', interval: 'daily', recurring: true });
const d0 = new Date(), d1 = new Date(); d1.setDate(d1.getDate() - 1);
store.toggleGoal(r.id, d1); store.toggleGoal(r.id, d0);
st = store.getState(d0);
const rr = st.goals.find((x) => x.id === r.id);
assert.ok(rr.doneNow); assert.strictEqual(rr.streak, 2);
st = store.getState(tomorrow);
assert.ok(!st.goals.find((x) => x.id === r.id).doneNow, 'recurring resets next period');
assert.strictEqual(st.goals.find((x) => x.id === r.id).streak, 2, 'streak survives until period missed');

// move between intervals
store.updateGoal(r.id, { interval: 'weekly' });
assert.strictEqual(store.allGoals().find((x) => x.id === r.id).interval, 'weekly');

// delete + restore
const del = store.deleteGoal(r.id);
store.restoreGoal(del);
assert.ok(store.allGoals().find((x) => x.id === r.id));

// description
const dg = store.createGoal({ subjectId: sid, title: 'Trip', description: '  Plan route  ', interval: 'monthly' });
assert.strictEqual(dg.description, 'Plan route');
store.updateGoal(dg.id, { description: 'New details' });
assert.strictEqual(store.allGoals().find((x) => x.id === dg.id).description, 'New details');

console.log('All tests passed ✔');
