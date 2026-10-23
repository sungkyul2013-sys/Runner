// 저장소에 독립적인 아주 얇은 SQLite 인터페이스.
// 서버에서는 node:sqlite, 미리보기(데모)에서는 sql.js가 이 모양을 구현한다.

export type SqlValue = string | number | null;

export interface Db {
  all<T = Record<string, any>>(sql: string, ...params: SqlValue[]): T[];
  get<T = Record<string, any>>(sql: string, ...params: SqlValue[]): T | undefined;
  run(sql: string, ...params: SqlValue[]): { changes: number; lastId: number };
  exec(sql: string): void;
  tx<T>(fn: () => T): T;
}

/** BEGIN/COMMIT 을 바깥쪽 한 번만 수행하는 트랜잭션 도우미 */
export function makeTx(exec: (sql: string) => void) {
  let depth = 0;
  return function tx<T>(fn: () => T): T {
    if (depth > 0) return fn();
    depth++;
    exec('BEGIN');
    try {
      const out = fn();
      exec('COMMIT');
      return out;
    } catch (e) {
      exec('ROLLBACK');
      throw e;
    } finally {
      depth--;
    }
  };
}

export const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');
