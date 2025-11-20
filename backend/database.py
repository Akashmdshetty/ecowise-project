# database.py
import sqlite3
import os
from datetime import datetime

EXAMPLE_CENTERS = [
    {
        "id": 1,
        "name": "Hassan City Municipal Waste Center",
        "type": "recycling",
        "address": "Near Bus Stand, MG Road, Hassan",
        "lat": 13.0069,
        "lng": 76.0991,
        "hours": "8:00 AM - 6:00 PM",
        "rating": 4.2,
        "services": ["Plastic", "Paper", "Glass", "Metal"],
        "distance": "0.5 km",
        "phone": ""
    },
    {
        "id": 2,
        "name": "Community Donation Center",
        "type": "donation",
        "address": "Station Road, Hassan",
        "lat": 13.008,
        "lng": 76.1005,
        "hours": "9:00 AM - 5:00 PM",
        "rating": 4.0,
        "services": ["Books", "Clothes"],
        "distance": "1.1 km",
        "phone": ""
    }
]

class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        self._ensure_dir()

    def _ensure_dir(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db_if_needed(self):
        conn = self._connect()
        cur = conn.cursor()
        # users table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                level TEXT DEFAULT 'Eco Friend',
                eco_points INTEGER DEFAULT 0,
                items_recycled INTEGER DEFAULT 0,
                carbon_saved_kg INTEGER DEFAULT 0,
                member_since TEXT
            )
        ''')
        # history table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                filename TEXT,
                processed_at TEXT,
                points_earned INTEGER,
                carbon_saved_kg INTEGER,
                objects_detected INTEGER,
                stored_path TEXT
            )
        ''')
        # centers table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS centers (
                id INTEGER PRIMARY KEY,
                name TEXT,
                type TEXT,
                address TEXT,
                lat REAL,
                lng REAL,
                hours TEXT,
                rating REAL,
                services TEXT,
                distance TEXT,
                phone TEXT,
                website TEXT
            )
        ''')
        conn.commit()

        # If centers empty, insert example centers
        cur.execute('SELECT count(*) as c FROM centers')
        if cur.fetchone()['c'] == 0:
            for c in EXAMPLE_CENTERS:
                cur.execute('''
                    INSERT INTO centers (id, name, type, address, lat, lng, hours, rating, services, distance, phone, website)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    c['id'], c['name'], c['type'], c['address'], c['lat'], c['lng'],
                    c.get('hours', ''), c.get('rating', 0), ','.join(c.get('services', [])),
                    c.get('distance', ''), c.get('phone', ''), c.get('website', '')
                ))
            conn.commit()

        conn.close()

    # user helpers
    def get_user(self, username):
        conn = self._connect()
        cur = conn.cursor()
        cur.execute('SELECT * FROM users WHERE username = ?', (username,))
        row = cur.fetchone()
        if not row:
            # create default user
            now = datetime.utcnow().isoformat()
            cur.execute('''
                INSERT INTO users (username, level, eco_points, items_recycled, carbon_saved_kg, member_since)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (username, 'Eco Friend', 0, 0, 0, now))
            conn.commit()
            cur.execute('SELECT * FROM users WHERE username = ?', (username,))
            row = cur.fetchone()
        user = dict(row)
        conn.close()
        return user

    def increment_user_stats(self, username, points, items, carbon):
        conn = self._connect()
        cur = conn.cursor()
        # ensure user exists
        self.get_user(username)
        cur.execute('''
            UPDATE users
            SET eco_points = eco_points + ?,
                items_recycled = items_recycled + ?,
                carbon_saved_kg = carbon_saved_kg + ?
            WHERE username = ?
        ''', (points, items, carbon, username))
        conn.commit()
        # optionally update level based on points
        cur.execute('SELECT eco_points FROM users WHERE username = ?', (username,))
        pts = cur.fetchone()['eco_points']
        level = 'Eco Friend'
        if pts >= 1000:
            level = 'Eco Champion'
        elif pts >= 200:
            level = 'Eco Warrior'
        cur.execute('UPDATE users SET level = ? WHERE username = ?', (level, username))
        conn.commit()
        conn.close()

    # history helpers
    def add_history(self, username, filename, points, carbon_saved_kg, objects_detected, stored_path):
        conn = self._connect()
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO history (username, filename, processed_at, points_earned, carbon_saved_kg, objects_detected, stored_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (username, filename, datetime.utcnow().isoformat(), points, carbon_saved_kg, objects_detected, stored_path))
        conn.commit()
        conn.close()

    def get_history(self, username, limit=50):
        conn = self._connect()
        cur = conn.cursor()
        cur.execute('''
            SELECT filename, processed_at, points_earned, carbon_saved_kg, objects_detected
            FROM history
            WHERE username = ?
            ORDER BY processed_at DESC
            LIMIT ?
        ''', (username, limit))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    # centers
    def get_centers(self):
        conn = self._connect()
        cur = conn.cursor()
        cur.execute('SELECT * FROM centers')
        rows = []
        for r in cur.fetchall():
            row = dict(r)
            # split services string back into list
            if row.get('services'):
                row['services'] = [s for s in row['services'].split(',') if s]
            else:
                row['services'] = []
            rows.append(row)
        conn.close()
        return rows

    def get_center_by_id(self, center_id):
        conn = self._connect()
        cur = conn.cursor()
        cur.execute('SELECT * FROM centers WHERE id = ?', (center_id,))
        r = cur.fetchone()
        if not r:
            conn.close()
            return None
        row = dict(r)
        if row.get('services'):
            row['services'] = [s for s in row['services'].split(',') if s]
        conn.close()
        return row

    def get_leaderboard(self, limit=20):
        conn = self._connect()
        cur = conn.cursor()
        cur.execute('SELECT username, eco_points, level FROM users ORDER BY eco_points DESC LIMIT ?', (limit,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
