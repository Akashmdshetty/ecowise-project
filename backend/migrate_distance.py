import sqlite3
import os

DB_PATH = "ecowise.db"

if not os.path.exists(DB_PATH):
    print("❌ ERROR: ecowise.db not found in this folder.")
    exit()

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Check existing table columns
cur.execute("PRAGMA table_info(centers);")
cols = [row[1] for row in cur.fetchall()]

print("Columns found:", cols)

if "distance" in cols:
    print("✔ Column 'distance' already exists. Nothing to change.")
else:
    print("➕ Adding 'distance' column to centers table...")
    cur.execute("ALTER TABLE centers ADD COLUMN distance TEXT DEFAULT '';")
    conn.commit()
    print("✔ Column added successfully.")

cur.close()
conn.close()
