import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLocalState } from '../lib/hooks';
import { Brand, Sheet } from './ui';
import type { StudentBrief } from '../../shared/types';
import { mdw } from '../../shared/date';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

function SideNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="side-nav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => 'side-link' + (isActive ? ' is-active' : '')}>
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

function TabBar({ items, more }: { items: NavItem[]; more?: () => void }) {
  return (
    <nav className="tabbar">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => 'tab' + (isActive ? ' is-active' : '')}>
          {i.label}
        </NavLink>
      ))}
      {more && (
        <button type="button" className="tab" onClick={more}>
          더보기
        </button>
      )}
    </nav>
  );
}

// ── 선생님 화면 틀 ─────────────────────────────────────

const TEACHER_NAV: NavItem[] = [
  { to: '/', label: '오늘', end: true },
  { to: '/calendar', label: '달력' },
  { to: '/students', label: '학생' },
  { to: '/makeups', label: '보강' },
  { to: '/feedback', label: '피드백' },
  { to: '/books', label: '교재' },
  { to: '/groups', label: '반·시간표' },
  { to: '/settings', label: '설정' },
];

export function TeacherShell({ children, today }: { children: ReactNode; today: string }) {
  const { me, academy, logout } = useAuth();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  return (
    <div className="shell shell-teacher">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-brand">
          <Brand name={academy.name} />
        </NavLink>
        <p className="sidebar-date">{mdw(today)}</p>
        <SideNav items={TEACHER_NAV} />
        <div className="sidebar-foot">
          <span className="who">
            {me?.name} <small>{me?.isAdmin ? '원장' : '선생님'}</small>
          </span>
          <button type="button" className="link" onClick={logout}>
            로그아웃
          </button>
        </div>
      </aside>
      <header className="topbar">
        <NavLink to="/">
          <Brand name={academy.name} compact />
        </NavLink>
        <span className="topbar-date">{mdw(today)}</span>
      </header>
      <main className="main">{children}</main>
      <TabBar items={TEACHER_NAV.slice(0, 4)} more={() => setMore(true)} />
      <Sheet open={more} onClose={() => setMore(false)} title="메뉴" width={420}>
        <div className="more-list">
          {TEACHER_NAV.slice(4).map((i) => (
            <NavLink key={i.to} to={i.to} className="more-link">
              {i.label}
            </NavLink>
          ))}
          <button type="button" className="more-link" onClick={logout}>
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
  { to: '/', label: '홈', end: true },
  { to: '/calendar', label: '일정' },
  { to: '/feedback', label: '피드백' },
  { to: '/books', label: '교재' },
];

export function FamilyShell({ children }: { children: ReactNode }) {
  const { me, academy, logout } = useAuth();
  const kids = me?.students ?? [];
  const [childId, setChildId] = useLocalState<number | null>(`raon.child.${me?.id}`, kids[0]?.id ?? null);
  const child = kids.find((k) => k.id === childId) ?? kids[0] ?? null;
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);

  return (
    <ChildCtx.Provider value={{ child, children: kids, setChild: setChildId }}>
      <div className="shell shell-family">
        <header className="fam-head">
          <div className="fam-head-inner">
            <NavLink to="/">
              <Brand name={academy.name} compact />
            </NavLink>
            <nav className="fam-nav">
              {FAMILY_NAV.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => 'fam-link' + (isActive ? ' is-active' : '')}>
                  {i.label}
                </NavLink>
              ))}
            </nav>
            {kids.length > 1 && (
              <div className="kid-switch" role="tablist" aria-label="자녀 선택">
                {kids.map((k) => (
                  <button key={k.id} type="button" role="tab" aria-selected={k.id === child?.id} className={k.id === child?.id ? 'is-on' : ''} onClick={() => setChildId(k.id)}>
                    {k.name}
                    <small>{k.grade}</small>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="fam-me" onClick={() => setMenu(true)}>
              <span className="fam-me-name">{me?.role === 'parent' ? me.name : child?.name ?? me?.name}</span>
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
                <button key={k.id} type="button" className={'more-link' + (k.id === child?.id ? ' is-on' : '')} onClick={() => setChildId(k.id)}>
                  {k.name} <small>{[k.school, k.grade].filter(Boolean).join(' ')}</small>
                </button>
              ))}
            <NavLink to="/account" className="more-link">
              비밀번호 바꾸기
            </NavLink>
            <button type="button" className="more-link" onClick={logout}>
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
