"""Durable state. Values containing profile/session/evidence data are encrypted at rest."""
import hashlib
import json
import os
import time
from contextlib import contextmanager
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, text


def key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class Store:
    def __init__(self, url=None, encryption_key=None):
        url = url or os.environ.get('DATABASE_URL', 'sqlite:///broadway.db')
        if url.startswith('postgres://'):
            url = url.replace('postgres://', 'postgresql+psycopg://', 1)
        elif url.startswith('postgresql://'):
            url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
        self.engine = create_engine(url, pool_pre_ping=True)
        self.cipher = Fernet(encryption_key or os.environ['DATA_ENCRYPTION_KEY'])
        with self.engine.begin() as c:
            c.execute(text('CREATE TABLE IF NOT EXISTS state (id VARCHAR(255) PRIMARY KEY, value TEXT NOT NULL, updated DOUBLE PRECISION NOT NULL)'))
            c.execute(text('CREATE TABLE IF NOT EXISTS leases (id VARCHAR(255) PRIMARY KEY, owner VARCHAR(255) NOT NULL, expires DOUBLE PRECISION NOT NULL)'))

    def encode(self, value):
        return self.cipher.encrypt(json.dumps(value).encode()).decode()

    def decode(self, value):
        return json.loads(self.cipher.decrypt(value.encode()))

    def get(self, id, default=None):
        with self.engine.connect() as c:
            row = c.execute(text('SELECT value FROM state WHERE id=:id'), {'id': id}).first()
        return self.decode(row[0]) if row else default

    def put(self, id, value):
        with self.engine.begin() as c:
            c.execute(text('INSERT INTO state(id,value,updated) VALUES (:id,:value,:now) ON CONFLICT(id) DO UPDATE SET value=:value,updated=:now'), {'id':id,'value':self.encode(value),'now':time.time()})

    def once(self, id, value):
        with self.engine.begin() as c:
            result = c.execute(text('INSERT INTO state(id,value,updated) VALUES (:id,:value,:now) ON CONFLICT(id) DO NOTHING'), {'id':id,'value':self.encode(value),'now':time.time()})
        return result.rowcount == 1

    def list(self, prefix, limit=200):
        with self.engine.connect() as c:
            rows = c.execute(text('SELECT id,value FROM state WHERE id LIKE :prefix ORDER BY updated DESC LIMIT :limit'), {'prefix':prefix+'%', 'limit':limit}).all()
        return [{'id':row[0], **self.decode(row[1])} for row in rows]

    def lease(self, name, owner, seconds=90):
        with self.engine.begin() as c:
            result = c.execute(text('INSERT INTO leases(id,owner,expires) VALUES (:id,:owner,:expires) ON CONFLICT(id) DO UPDATE SET owner=:owner,expires=:expires WHERE leases.expires<:now OR leases.owner=:owner'), {'id':name,'owner':owner,'expires':time.time()+seconds,'now':time.time()})
        return result.rowcount == 1

    def release(self, name, owner):
        with self.engine.begin() as c:
            c.execute(text('DELETE FROM leases WHERE id=:id AND owner=:owner'), {'id':name,'owner':owner})
