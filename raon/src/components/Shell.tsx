import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { prefetch, useLocalState } from '../lib/hooks';
import { vt } from '../lib/motion';
import { Brand, Sheet } from './ui';
import type { StudentBrief } from '../../shared/types';
import { addDays, monthGrid, mdw, todayIn } from '../../shared/date';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}

// 선 하나로 그린 작은 그림 (메뉴 이름 옆)
const I = {
  today: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5V10l2.5 1.6" />
    </svg>
  ),
  cal: (
    <svg viewBox="0 0 20 20">
      <rect x="3.5" y="4.5" width="13" height="12" rx="2.5" />
      <path d="M3.5 8.5h13M7 3v3M13 3v3" />
    </svg>
  ),
  students: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
    </svg>
  ),
  makeup: (
    <svg viewBox="0 0 20 20">
      <path d="M4 10a6 6 0 1 0 1.8-4.3" />
      <path d="M4 3.5v3h3" />
    </svg>
  ),
  feedback: (
    <svg viewBox="0 0 20 20">
      <rect x="3" y="5" width="14" height="10.5" rx="2" />
      <path d="M3.5 6l6.5 5 6.5-5" />
    </svg>
  ),
  books: (
    <svg viewBox="0 0 20 20">
      <path d="M4 4.5h4.5a2 2 0 0 1 2 2v9a1.6 1.6 0 0 0-1.6-1.6H4z" />
      <path d="M16 4.5h-4.5a2 2 0 0 0-2 2" />
      <path d="M16 4.5v9.4h-4.9a1.6 1.6 0 0 0-1.6 1.6" />
    </svg>
  ),
  groups: (
    <svg viewBox="0 0 20 20">
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.5" />
      <rect x="11" y="11" width="5.5" height="5.5" rx="1.5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6 15 15M5 15l1.4-1.4M13.6 6.4 15 5" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 20 20">
      <path d="M3.5 9.5 10 4l6.5 5.5" />
      <path d="M5.5 8.5V16h9V8.5" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 20 20">
      <circle cx="5" cy="10" r="1.2" />
      <circle cx="10" cy="10" r="1.2" />
      <circle cx="15" cy="10" r="1.2" />
    </svg>
  ),
};

/** 지금 있는 메뉴 뒤에 깔리는 둥근 표시. 화면이 바뀔 때 다음 메뉴로 미끄러져 간다. */
function NavItemLink({ item, cls, pillName }: { item: NavItem; cls: string; pillName: string }) {
  return (
    <NavLink to={item.to} end={item.end} viewTransition className={({ isActive }) => cls + (isActive ? ' is-active' : '')}>
      {({ isActive }) => (
        <>
          {isActive && <span className="nav-pill" style={{ viewTransitionName: pillName }} />}
          <span className="nav-ico" aria-hidden="true">
            {item.icon}
          </span>
          <span className="nav-label">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function TabBar({ items, more }: { items: NavItem[]; more?: () => void }) {
  return (
    <nav className="tabbar" aria-label="메뉴">
      <div className="tabbar-in">
        {items.map((i) => (
          <NavItemLink key={i.to} item={i} cls="tab" pillName="tab-pill" />
        ))}
        {more && (
          <button type="button" className="tab" onClick={more}>
            <span className="nav-ico" aria-hidden="true">
              {I.more}
            </span>
            <span className="nav-label">더보기</span>
          </button>
        )}
      </div>
    </nav>
  );
}

// ── 선생님 화면 틀 ─────────────────────────────────────

const TEACHER_NAV: NavItem[] = [
  { to: '/', label: '오늘', end: true, icon: I.today },
  { to: '/calendar', label: '달력', icon: I.cal },
  { to: '/students', label: '학생', icon: I.students },
  { to: '/makeups', label: '보강', icon: I.makeup },
  { to: '/feedback', label: '피드백', icon: I.feedback },
  { to: '/books', label: '교재', icon: I.books },
  { to: '/groups', label: '반·시간표', icon: I.groups },
  { to: '/settings', label: '설정', icon: I.settings },
];

export function TeacherShell({ children, today }: { children: ReactNode; today: string }) {
  const { me, academy, logout } = useAuth();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  useEffect(() => {
    // 자주 가는 화면 데이터를 미리 받아 두면 화면 전환이 끊기지 않는다
    const g = monthGrid(today.slice(0, 8) + '01');
    prefetch(['/dashboard', '/students', '/makeups', '/groups', '/textbooks', '/feedback?limit=200', `/calendar?from=${g[0]}&to=${g[41]}`]);
  }, [today]);
  return (
    <div className="shell shell-teacher">
      <aside className="sidebar">
        <NavLink to="/" viewTransition className="sidebar-brand">
          <Brand name={academy.name} />
        </NavLink>
        <p className="sidebar-date">{mdw(today)}</p>
        <nav className="side-nav">
          {TEACHER_NAV.map((i) => (
            <NavItemLink key={i.to} item={i} cls="side-link" pillName="side-pill" />
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar" aria-hidden="true">
            {me?.name.slice(0, 1)}
          </span>
          <span className="who">
            {me?.name}
            <small>{me?.isAdmin ? '원장' : '선생님'}</small>
          </span>
          <button type="button" className="link" onClick={logout}>
            로그아웃
          </button>
        </div>
      </aside>
      <header className="topbar">
        <NavLink to="/" viewTransition>
          <Brand name={academy.name} compact />
        </NavLink>
        <span className="topbar-date">{mdw(today)}</span>
      </header>
      <main className="main">{children}</main>
      <TabBar items={TEACHER_NAV.slice(0, 4)} more={() => setMore(true)} />
      <Sheet open={more} onClose={() => setMore(false)} title="메뉴" width={420}>
        <div className="more-list">
          {TEACHER_NAV.slice(4).map((i) => (
            <NavLink key={i.to} to={i.to} viewTransition className="more-link">
              <span className="nav-ico" aria-hidden="true">
                {i.icon}
              </span>
              {i.label}
            </NavLink>
          ))}
          <button type="button" className="more-link" onClick={logout}>
            <span className="nav-ico" aria-hidden="true" />
            로그아웃 <small>{me?.name}</small>
          </button>
        </div>
      </Sheet>
    </div>
  );
}

// ── 학생·학부모 화면 틀 ────────────────────────────────

const ChildCtx = createContext<{ child: StudentBrief | null; children: StudentBrief[]; setChild(id: number): void }>(null!);
export const useChild = () => useContext(ChildCtx);

const FAMILY_NAV: NavItem[] = [
  { to: '/', label: '홈', end: true, icon: I.home },
  { to: '/calendar', label: '일정', icon: I.cal },
  { to: '/feedback', label: '피드백', icon: I.feedback },
  { to: '/books', label: '교재', icon: I.books },
];

export function FamilyShell({ children }: { children: ReactNode }) {
  const { me, academy, logout } = useAuth();
  const kids = me?.students ?? [];
  const [childId, setChildId] = useLocalState<number | null>(`raon.child.${me?.id}`, kids[0]?.id ?? null);
  const child = kids.find((k) => k.id === childId) ?? kids[0] ?? null;
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    if (!child) return;
    const t = todayIn();
    const g = monthGrid(t.slice(0, 8) + '01');
    prefetch([`/home?studentId=${child.id}`, `/feedback?studentId=${child.id}`, `/student-books?studentId=${child.id}`, `/calendar?from=${g[0]}&to=${g[41]}&studentId=${child.id}`, `/calendar?from=${t}&to=${addDays(t, 6)}&studentId=${child.id}`]);
  }, [child]);
  const switchTo = (id: number) => vt(() => setChildId(id), 'swap');

  return (
    <ChildCtx.Provider value={{ child, children: kids, setChild: switchTo }}>
      <div className="shell shell-family">
        <header className="fam-head">
          <div className="fam-head-inner">
            <NavLink to="/" viewTransition className="fam-brand">
              <Brand name={academy.name} compact />
            </NavLink>
            <nav className="fam-nav">
              {FAMILY_NAV.map((i) => (
                <NavItemLink key={i.to} item={i} cls="fam-link" pillName="fam-pill" />
              ))}
            </nav>
            {kids.length > 1 && (
              <div className="kid-switch" role="tablist" aria-label="자녀 선택">
                {kids.map((k) => (
                  <button key={k.id} type="button" role="tab" aria-selected={k.id === child?.id} className={k.id === child?.id ? 'is-on' : ''} onClick={() => switchTo(k.id)}>
                    {k.id === child?.id && <span className="kid-pill" style={{ viewTransitionName: 'kid-pill' }} />}
                    <span className="kid-name">{k.name}</span>
                    <small>{k.grade}</small>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="fam-me" onClick={() => setMenu(true)}>
              <span className="avatar" aria-hidden="true">
                {(me?.role === 'parent' ? me.name : child?.name ?? me?.name ?? '').slice(0, 1)}
              </span>
              <span className="fam-me-role">{me?.role === 'parent' ? '학부모' : '학생'}</span>
            </button>
          </div>
        </header>
        <main className="fam-main">{child ? children : <p className="empty-title">연결된 학생이 없습니다. 학원에 문의해 주세요.</p>}</main>
        <TabBar items={FAMILY_NAV} />
        <Sheet open={menu} onClose={() => setMenu(false)} title={me?.name + (me?.role === 'parent' ? ' 학부모님' : '')} width={420}>
          <div className="more-list">
            {kids.length > 1 &&
              kids.map((k) => (
                <button key={k.id} type="button" className={'more-link' + (k.id === child?.id ? ' is-on' : '')} onClick={() => switchTo(k.id)}>
                  <span className="avatar sm" aria-hidden="true">
                    {k.name.slice(0, 1)}
                  </span>
                  {k.name} <small>{[k.school, k.grade].filter(Boolean).join(' ')}</small>
                </button>
              ))}
            <NavLink to="/account" viewTransition className="more-link">
              <span className="nav-ico" aria-hidden="true">
                {I.settings}
              </span>
              비밀번호 바꾸기
            </NavLink>
            <button type="button" className="more-link" onClick={logout}>
              <span className="nav-ico" aria-hidden="true" />
              로그아웃
            </button>
          </div>
          {(academy.phone || academy.address) && (
            <p className="academy-contact">
              {academy.name}
              <br />
              {[academy.phone, academy.address].filter(Boolean).join(' · ')}
            </p>
          )}
        </Sheet>
      </div>
    </ChildCtx.Provider>
  );
}
