// migrate_history_columns.js
// Run from backend folder with: node migrate_history_columns.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Failed to open DB:', err);
    process.exit(1);
  }
});

function columnExists(table, column, cb) {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) return cb(err);
    const exists = rows.some(r => r.name === column);
    cb(null, exists);
  });
}

const colsToAdd = [
  { name: 'eco_points_earned', sql: 'INTEGER DEFAULT 0' },
  { name: 'items_recycled', sql: 'INTEGER DEFAULT 0' },
  { name: 'carbon_saved_kg', sql: 'REAL DEFAULT 0.0' }
];

(async function run() {
  try {
    for (const c of colsToAdd) {
      await new Promise((resolve, reject) => {
        columnExists('history', c.name, (err, exists) => {
          if (err) return reject(err);
          if (exists) {
            console.log(`Column already exists: ${c.name}`);
            return resolve();
          }
          const alter = `ALTER TABLE history ADD COLUMN ${c.name} ${c.sql};`;
          console.log('Adding column:', c.name);
          db.run(alter, (aerr) => {
            if (aerr) return reject(aerr);
            console.log('Added', c.name);
            resolve();
          });
        });
      });
    }
    console.log('Migration complete.');
    db.close();
  } catch (e) {
    console.error('Migration failed:', e);
    db.close();
    process.exit(1);
  }
})();
