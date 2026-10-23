// 데이터베이스가 비어 있을 때 예시 데이터를 넣는다: npm run seed
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openNodeDb } from './node/sqlite';
import { nodeCrypto } from './node/crypto';
import { migrate } from './core/schema';
import { seedDemo, DEMO_PASSWORD } from './core/seed';
import { todayIn } from '../shared/date';

const dir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dir, { recursive: true });
const db = openNodeDb(join(dir, 'raon.db'));
migrate(db);
if (db.get('SELECT 1 FROM users LIMIT 1')) {
  console.log('이미 데이터가 있어 예시 데이터를 넣지 않았습니다.');
} else {
  seedDemo(db, nodeCrypto, todayIn());
  console.log(`예시 데이터를 넣었습니다. 원장 정다은 · 학생 김태윤 · 학부모 박미영 (비밀번호 모두 ${DEMO_PASSWORD})`);
}
