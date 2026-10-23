import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { makeTx, type Db, type SqlValue } from '../core/db';

export function openNodeDb(file: string): Db {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA busy_timeout = 5000');
  raw.exec('PRAGMA foreign_keys = ON');
  const cache = new Map<string, StatementSync>();
  const stmt = (sql: string) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  const exec = (sql: string) => raw.exec(sql);
  return {
    all: <T>(sql: string, ...p: SqlValue[]) => stmt(sql).all(...p) as T[],
    get: <T>(sql: string, ...p: SqlValue[]) => stmt(sql).get(...p) as T | undefined,
    run: (sql: string, ...p: SqlValue[]) => {
      const r = stmt(sql).run(...p);
      return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    },
    exec,
    tx: makeTx(exec),
  };
}
