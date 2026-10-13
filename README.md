# Goals-Manager

Personal goal tracker: each **subject** (Personal, Relationship, Education, Work, House, …) has its own table with **Daily / Weekly / Monthly / Yearly** columns.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) (v20 or newer). No other packages are needed locally.
2. Double-click **`start.bat`** (or run `node server.js`) and open http://localhost:3000.

Locally, your data is saved in `data/goals.json`, and there's no sign-in.

## Run it online (phone + laptop, synced)

See **[DEPLOY.md](DEPLOY.md)**: GitHub → Neon (database) → Render (hosting) → Google sign-in.
Online, the same code stores data in Postgres (`DATABASE_URL`) and requires Google sign-in.

**⋯ → Download backup / Restore from backup** moves goals between the local and online versions, and makes a good occasional backup.

## Using it

- **Add** — type in the box at the bottom of a column, press Enter. Click **↻ Once / Repeats** first to make it a recurring goal.
- **Complete** — click the circle. Recurring goals reset every period and show a 🔥 streak.
- **Move** — drag a goal to another column (or another subject), or use the **⇄** button (works on phone).
- **Edit** — **✎** opens the edit window (title, description, time, subject, repeat). Double-click a title to rename in place. **Delete** with **✕** (Undo appears for 5 s).
- **Descriptions** — optional details under the title, shown on hover. **Show details** (top bar) shows them under every goal.
- **Hebrew** — titles and descriptions pick their direction (RTL/LTR) automatically.
- **Carry over** — unfinished one-time goals automatically roll into the next day/week/month/year. Finished ones are archived when their period ends.
- On a phone, the tabs at the top switch between Daily / Weekly / Monthly / Yearly.

## Project layout

```
server.js                     HTTP server + REST API
src/store.js                  all goal/subject logic (in memory, persisted via persistence.js)
src/persistence.js            JSON file locally, Postgres when DATABASE_URL is set
src/auth.js                   Google sign-in + session cookie (on when GOOGLE_CLIENT_ID is set)
render.yaml / DEPLOY.md       online hosting setup
src/periods.js                period keys, streaks
src/events.js                 event bus (goal.completed, period.started, …)
src/scheduler.js              period rollover + timed reminders
src/config.js                 defaults, overridden by config.json
src/notifications/index.js    routes events → channels
src/notifications/channels/   console (works), email / whatsapp / push (stubs)
public/                       the web UI (plain HTML/CSS/JS)
test/run.js                   `npm test`
```

## Adding notifications later

1. Copy `config.example.json` → `config.json`.
2. Implement `send()` in the channel file (instructions are in each file: `whatsapp.js` → Twilio/Meta API with built-in `fetch`, `email.js` → nodemailer, `push.js` → web-push).
3. Set `"enabled": true` for the channel and add it to `notifications.routes` (e.g. `"reminder": ["whatsapp"]`).
4. Test: `POST /api/notifications/test` with `{"channel":"whatsapp"}`.

Reminder times live in `config.json → reminders`. Inbound messages (e.g. replying "done gym" on WhatsApp) arrive at `POST /api/webhooks/whatsapp` — a sample handler is already in `whatsapp.js`. Receiving messages needs the online version, and the webhook only answers once that channel is enabled.

## API

| Method | Path | Body |
|---|---|---|
| GET | `/api/state` | — |
| POST | `/api/subjects` | `{name, color}` |
| PATCH / DELETE | `/api/subjects/:id` | `{name?, color?, collapsed?}` |
| POST | `/api/goals` | `{subjectId, title, interval, recurring}` |
| PATCH / DELETE | `/api/goals/:id` | `{title?, interval?, subjectId?, recurring?, order?}` |
| POST | `/api/goals/:id/toggle` | — |
| GET | `/api/archive` | — |
| GET | `/api/me` | — (sign-in status) |
| GET | `/api/export` | — (downloads a backup) |
| POST | `/api/import` | backup JSON (replaces everything) |
