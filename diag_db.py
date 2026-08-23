import sqlite3
c = sqlite3.connect('healthcare.db')
cur = c.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'")
row = cur.fetchone()
print('has alembic_version:', bool(row))
if row:
    cur.execute('SELECT version_num FROM alembic_version')
    print('current rev:', cur.fetchall())
cols = [r[1] for r in c.execute('PRAGMA table_info(users)')]
print('users columns:', cols)
print('is_active present:', 'is_active' in cols)
c.close()
