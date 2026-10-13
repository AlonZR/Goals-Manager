// Where the app's data document is kept.
//  - No DATABASE_URL  -> data/goals.json on disk (local use, start.bat)
//  - DATABASE_URL set -> a Postgres table (online use, e.g. Neon)
//
// The whole app state is one small JSON document, so both backends simply
// read it once at startup and write it back after every change.

const fs = require('fs');
const path = require('path');

function fileAdapter() {
  const dir = process.env.MYGOALS_DATA_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'goals.json');
  const readSync = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  return {
    name: `file (${file})`,
    readSync,
    async read() { return readSync(); },
    write(data) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file); // atomic replace
    },
    async flush() {},
  };
}

function postgresAdapter(url) {
  const { Pool } = require('pg'); // only needed online
  const pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 3,
  });
  let ready = null;
  const ensureTable = () => (ready ??= pool.query(
    'CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'
  ));

  // Writes are serialized; if several changes happen quickly only the latest is sent.
  let pending = null;
  let writing = null;
  async function drain() {
    while (pending) {
      const json = pending;
      pending = null;
      try {
        await ensureTable();
        await pool.query(
          `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [json]
        );
      } catch (e) {
        console.error('[db] save failed, retrying in 3s:', e.message);
        pending = pending || json;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    writing = null;
  }

  return {
    name: 'postgres',
    async read() {
      await ensureTable();
      const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
      return rows[0] ? rows[0].data : null;
    },
    write(data) {
      pending = JSON.stringify(data);
      writing ??= drain();
    },
    async flush() { if (writing) await writing; },
  };
}

module.exports = process.env.DATABASE_URL ? postgresAdapter(process.env.DATABASE_URL) : fileAdapter();
