// sql.js(브라우저 안 SQLite)를 서버와 같은 Db 모양으로 감싼다
import { makeTx, type Db, type SqlValue } from '../server/core/db';

export interface SqlJsDatabase {
  prepare(sql: string): {
    bind(values: SqlValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, any>;
    free(): boolean;
  };
  run(sql: string, params?: SqlValue[]): unknown;
  exec(sql: string): { columns: string[]; values: any[][] }[];
  getRowsModified(): number;
  export(): Uint8Array;
}

export function wrapSqlJs(raw: SqlJsDatabase): Db {
  const all = <T>(sql: string, ...p: SqlValue[]): T[] => {
    const st = raw.prepare(sql);
    try {
      st.bind(p);
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      return out;
    } finally {
      st.free();
    }
  };
  const exec = (sql: string) => {
    raw.exec(sql);
  };
  return {
    all,
    get: <T>(sql: string, ...p: SqlValue[]) => all<T>(sql, ...p)[0],
    run: (sql: string, ...p: SqlValue[]) => {
      raw.run(sql, p);
      const changes = raw.getRowsModified();
      const lastId = Number(raw.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0);
      return { changes, lastId };
    },
    exec,
    tx: makeTx(exec),
  };
}
