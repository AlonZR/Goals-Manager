// Central event bus. The store emits domain events here; anything that wants to
// react (notifications, logging, future integrations) subscribes without the
// store knowing about it.
//
// Events:
//   goal.created      { goal }
//   goal.updated      { goal, changes }
//   goal.moved        { goal, from: {subjectId, interval}, to: {subjectId, interval} }
//   goal.completed    { goal, periodKey }
//   goal.uncompleted  { goal, periodKey }
//   goal.deleted      { goal }
//   goal.rolled       { goal, fromPeriod, toPeriod }   // one-off auto-rolled forward
//   period.started    { interval, periodKey }          // a new day/week/month/year began

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

module.exports = bus;
