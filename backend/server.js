// server.js
// EcoWise backend - Full version
// - Auth: /api/register, /api/login, /api/me
// - User/profile/history/leaderboard endpoints for dashboard
// - Admin endpoints: /admin/users, /admin/user/:id, /admin/export/users.csv
// - Serves static frontend from ../frontend
//
// DB file location (relative to this file): ./users.db
//
// Note: create a .env file with JWT_SECRET and ADMIN_SECRET for production.
//
// Uploaded project zip on assistant side (if needed): /mnt/data/ecowise-project[1].zip

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors()); // in production, restrict origin(s)
app.use(bodyParser.json());

// config
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_to_a_strong_secret';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change_this_admin_secret';

// DB path
const dbPath = path.join(__dirname, 'users.db');

// ensure db directory exists (not necessary for simple setups, but safe)
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
} catch (e) { /* ignore */ }

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Failed to open DB', err);
  else console.log('SQLite DB ready:', dbPath);
});

// Create required tables
db.serialize(() => {
  // users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // history table: stores analyzed items per user (simple schema)
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      filename TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      eco_points_earned INTEGER DEFAULT 0,
      items_recycled INTEGER DEFAULT 0,
      carbon_saved_kg REAL DEFAULT 0.0
    );
  `);
});

// Helper: safe user object returned to clients
function safeUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, created_at: row.created_at };
}

// ----------------------
// Auth endpoints (/api)
// ----------------------

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Username must be 3+ chars and password 6+ chars.' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    stmt.run(username, password_hash, function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'Username already exists.' });
        }
        console.error('DB insert error', err);
        return res.status(500).json({ error: 'Database error.' });
      }
      const user = { id: this.lastID, username };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
      // store username client-side for quick UI update (frontend does this)
      res.json({ message: 'Registered', token, user: safeUser(user) });
    });
  } catch (e) {
    console.error('Register error', e);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username & password required.' });

  db.get('SELECT id, username, password_hash, created_at FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) {
      console.error('DB get error', err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) return res.status(401).json({ error: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = { id: row.id, username: row.username };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Logged in', token, user: safeUser(row) });
  });
});

// Auth middleware for API endpoints expecting JWT
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token.' });
  const token = auth.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid token.' });
    req.user = payload; // { id, username, iat, exp }
    next();
  });
}

// Return current user (protected)
app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

// ----------------------
// User/profile/history/leaderboard endpoints
// Implemented both under /user/... and /api/user/... for compatibility
// ----------------------

// helper to fetch aggregated user stats from history
function getUserAggregates(username, cb) {
  db.get(
    `SELECT 
       COALESCE(SUM(eco_points_earned),0) AS eco_points,
       COALESCE(SUM(items_recycled),0) AS items_recycled,
       COALESCE(SUM(carbon_saved_kg),0) AS carbon_saved_kg
     FROM history WHERE username = ?`,
    [username],
    (err, row) => {
      if (err) return cb(err);
      cb(null, row || { eco_points: 0, items_recycled: 0, carbon_saved_kg: 0.0 });
    }
  );
}

// GET profile (both /user/:username and /api/user/:username)
function handleGetUserProfile(req, res) {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  db.get('SELECT id, username, created_at FROM users WHERE username = ?', [username], (err, userRow) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'DB error' }); }
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    getUserAggregates(username, (aggErr, agg) => {
      if (aggErr) { console.error(aggErr); return res.status(500).json({ error: 'DB error' }); }
      const out = {
        id: userRow.id,
        username: userRow.username,
        created_at: userRow.created_at,
        eco_points: agg.eco_points || 0,
        items_recycled: agg.items_recycled || 0,
        carbon_saved_kg: agg.carbon_saved_kg || 0.0
      };
      res.json(out);
    });
  });
}

app.get('/user/:username', handleGetUserProfile);
app.get('/api/user/:username', handleGetUserProfile);

// GET user history (both /user/:username/history and /api/user/:username/history)
function handleGetUserHistory(req, res) {
  const username = req.params.username;
  const limit = parseInt(req.query.limit, 10) || 50;
  db.all('SELECT filename, processed_at, eco_points_earned, items_recycled, carbon_saved_kg FROM history WHERE username = ? ORDER BY processed_at DESC LIMIT ?', [username, limit], (err, rows) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'DB error' }); }
    res.json({ history: rows || [] });
  });
}
app.get('/user/:username/history', handleGetUserHistory);
app.get('/api/user/:username/history', handleGetUserHistory);

// GET leaderboard (both /leaderboard and /api/leaderboard)
function handleLeaderboard(req, res) {
  db.all(
    `SELECT username,
            COALESCE(SUM(eco_points_earned),0) AS eco_points,
            COALESCE(SUM(items_recycled),0) AS items_recycled,
            COALESCE(SUM(carbon_saved_kg),0) AS carbon_saved_kg
     FROM history
     GROUP BY username
     ORDER BY eco_points DESC
     LIMIT 25`,
    [],
    (err, rows) => {
      if (err) { console.error(err); return res.status(500).json({ error: 'DB error' }); }
      res.json({ leaderboard: rows || [] });
    }
  );
}
app.get('/leaderboard', handleLeaderboard);
app.get('/api/leaderboard', handleLeaderboard);

// ----------------------
// Admin endpoints (protected by ADMIN_SECRET header or ?admin_secret=)
// ----------------------

// simple admin auth middleware
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-secret'] || req.query.admin_secret;
  if (!token || token !== ADMIN_SECRET) return res.status(401).json({ error: 'Admin auth required' });
  next();
}

// GET /admin/users?limit=100&offset=0&search=alice
app.get('/admin/users', adminAuth, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = parseInt(req.query.offset, 10) || 0;
  const search = (req.query.search || '').trim();

  let sql = 'SELECT id, username, created_at FROM users';
  const params = [];
  if (search) {
    sql += ' WHERE username LIKE ?';
    params.push('%' + search + '%');
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ users: rows || [] });
  });
});

// GET /admin/user/:id
app.get('/admin/user/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.get('SELECT id, username, created_at FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.all('SELECT filename, processed_at, eco_points_earned, items_recycled, carbon_saved_kg FROM history WHERE username = ? ORDER BY processed_at DESC LIMIT 500', [row.username], (hErr, hRows) => {
      if (hErr) return res.status(500).json({ error: 'DB error' });
      res.json({ user: row, history: hRows || [] });
    });
  });
});

// GET /admin/export/users.csv
app.get('/admin/export/users.csv', adminAuth, (req, res) => {
  db.all('SELECT id, username, created_at FROM users ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.write('id,username,created_at\n');
    for (const r of rows) {
      const u = (r.username || '').replace(/"/g, '""');
      res.write(`${r.id},"${u}",${r.created_at}\n`);
    }
    res.end();
  });
});

// ----------------------
// Optional: simple endpoint to add a history row (useful for seeding / testing)
// Protected by JWT or admin if desired. Here we allow authenticated users to post their own history.
// POST /api/history
// Body: { filename, eco_points_earned, items_recycled, carbon_saved_kg }
// ----------------------
app.post('/api/history', authenticate, (req, res) => {
  const username = req.user && req.user.username;
  if (!username) return res.status(401).json({ error: 'Unauthorized' });

  const { filename, eco_points_earned = 0, items_recycled = 0, carbon_saved_kg = 0.0 } = req.body || {};
  db.run('INSERT INTO history (username, filename, eco_points_earned, items_recycled, carbon_saved_kg) VALUES (?, ?, ?, ?, ?)',
    [username, filename || 'unknown', eco_points_earned, items_recycled, carbon_saved_kg],
    function(err) {
      if (err) { console.error(err); return res.status(500).json({ error: 'DB error' }); }
      res.json({ insertedId: this.lastID });
    }
  );
});

// ----------------------
// Serve static frontend files from ../frontend
// ----------------------
const staticPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  // root -> login page
  app.get('/', (req, res) => {
    res.sendFile(path.join(staticPath, 'login.html'));
  });
}

// ----------------------
// Start server
// ----------------------
app.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
  console.log('🔐 JWT Secret Set:', JWT_SECRET !== 'change_this_to_a_strong_secret');
  console.log('🔐 Admin Secret Set:', ADMIN_SECRET !== 'change_this_admin_secret');
});
