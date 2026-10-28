"""Consistent encrypted SQLite snapshots, included in the Droplet's weekly backup."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path('/var/lib/broadway/backups')
root.mkdir(mode=0o700, exist_ok=True)
destination = root / (datetime.now(timezone.utc).strftime('%Y-%m-%d') + '.db')
with sqlite3.connect('/var/lib/broadway/broadway.db') as source:
    with sqlite3.connect(destination) as backup:
        source.backup(backup)
destination.chmod(0o600)
for old in sorted(root.glob('*.db'))[:-14]:
    old.unlink()
