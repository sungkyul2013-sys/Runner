import type { SessionKind } from './types';
import { EVENT_LABEL } from './types';

/** 제목을 비워 둔 일정에 붙는 이름: '고2 문학·독서 보강', '휴원' */
export function autoTitle(kind: SessionKind, prefix: string | null | undefined) {
  return prefix ? `${prefix} ${EVENT_LABEL[kind]}` : EVENT_LABEL[kind];
}
