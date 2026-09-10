import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Store {
  readonly hasSeen: (eventID: string) => boolean;
  readonly recordSeen: (eventID: string) => void;
  readonly close: () => void;
}

const RETAIN_MS = 24 * 60 * 60 * 1000;

/**
 * Opens the SQLite dedup store. Slack redelivers an event up to three times
 * and Socket Mode reconnects replay recent ones, so every envelope is checked
 * by `event_id` before a hook runs. Rows older than a day are pruned on open.
 */
export function openStore(dbFile: string): Store {
  mkdirSync(dirname(dbFile), { recursive: true, mode: 0o700 });

  const db = new Database(dbFile, { create: true });

  db.run('PRAGMA journal_mode = WAL');
  db.run('CREATE TABLE IF NOT EXISTS seen (event_id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
  db.run('DELETE FROM seen WHERE at < ?', [Date.now() - RETAIN_MS]);

  const select = db.prepare<{ event_id: string }, [string]>('SELECT event_id FROM seen WHERE event_id = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO seen (event_id, at) VALUES (?, ?)');

  return {
    hasSeen: (eventID) => select.get(eventID) !== null,
    recordSeen: (eventID) => {
      insert.run(eventID, Date.now());
    },
    close: () => {
      db.close();
    },
  };
}
