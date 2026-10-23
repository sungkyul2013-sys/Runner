import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { prefetch, useApi, useLocalState } from '../lib/hooks';
import { vt } from '../lib/motion';
import { Avatar, Brand, Chevron, Sheet } from './ui';
import type { StudentBrief, TeacherDashboard } from '../../shared/types';
import { addDays, monthGrid, mdw, todayIn } from '../../shared/date';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
  badge?: number;
}

// 선 하나로 그린 작은 그림 (메뉴 이름 옆)
const I = {
  today: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.8 1.8" />
    </svg>
  ),
  cal: (
    <svg viewBox="0 0 20 20">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.6" />
      <path d="M3 8.5h14M7 2.8v3.2M13 2.8v3.2" />
    </svg>
  ),
  students: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 16.5c.9-3.1 3.2-4.7 6.2-4.7s5.3 1.6 6.2 4.7" />
    </svg>
  ),
  makeup: (
    <svg viewBox="0 0 20 20">
      <path d="M3.8 10a6.2 6.2 0 1 0 1.9-4.5" />
      <path d="M3.6 3v3.4H7" />
    </svg>
  ),
  feedback: (
    <svg viewBox="0 0 20 20">
      <rect x="2.8" y="4.5" width="14.4" height="11" rx="2.4" />
      <path d="M3.4 5.6 10 10.6l6.6-5" />
    </svg>
  ),
  books: (
    <svg viewBox="0 0 20 20">
      <path d="M10 5.6C8.6 4.4 6.3 4 3.5 4.2v11c2.8-.2 5.1.2 6.5 1.4 1.4-1.2 3.7-1.6 6.5-1.4v-11c-2.8-.2-5.1.2-6.5 1.4z" />
      <path d="M10 5.6v11" />
    </svg>
  ),
  groups: (
    <svg viewBox="0 0 20 20">
      <rect x="3" y="3" width="6" height="6" rx="1.6" />
      <rect x="11" y="3" width="6" height="6" rx="1.6" />
      <rect x="3" y="11" width="6" height="6" rx="1.6" />
      <rect x="11" y="11" width="6" height="6" rx="1.6" />
    </svg>
  ),
  consult: (
    <svg viewBox="0 0 20 20">
      <path d="M4.5 4h11a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9l-3.6 2.6v-2.6h-.9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2.2M10 15.2v2.2M2.6 10h2.2M15.2 10h2.2M4.8 4.8l1.5 1.5M13.7 13.7l1.5 1.5M4.8 15.2l1.5-1.5M13.7 6.3l1.5-1.5" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 20 20">
      <path d="M3.2 9.4 10 3.6l6.8 5.8" />
      <path d="M5.2 8v8.4h9.6V8" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 20 20">
      <circle cx="4.8" cy="10" r="1.3" />
      <circle cx="10" cy="10" r="1.3" />
      <circle cx="15.2" cy="10" r="1.3" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 20 20">
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.8a3 3 0 0 1 6 0V9" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 20 20">
      <path d="M8 4H5.5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5.5 16H8" />
      <path d="M12 6.5 15.5 10 12 13.5M15.5 10H8" />
    </svg>
  ),
};

/** 지금 있는 메뉴 뒤에 깔리는 표시. 화면이 바뀔 때 다음 메뉴로 미끄러져 간다. */
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
          {!!item.badge && <span className="nav-badge">{item.badge}</span>}
        </>
      )}
    </NavLink>
  );
}

function TabBar({ items, more, moreOn }: { items: NavItem[]; more?: () => void; moreOn?: boolean }) {
  return (
    <nav className="tabbar" aria-label="메뉴">
      {items.map((i) => (
        <NavItemLink key={i.to} item={i} cls="tab" pillName="tab-pill" />
      ))}
      {more && (
        <button type="button" className={'tab' + (moreOn ? ' is-active' : '')} onClick={more}>
          <span className="nav-ico" aria-hidden="true">
            {I.more}
          </span>
          <span className="nav-label">더보기</span>
        </button>
      )}
    </nav>
  );
}

function MenuRow({ to, icon, label, onClick, danger, aside }: { to?: string; icon: ReactNode; label: string; onClick?: () => void; danger?: boolean; aside?: ReactNode }) {
  const inner = (
    <>
      <span className="menu-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="menu-label">{label}</span>
      {aside && <span className="menu-aside">{aside}</span>}
      {to && <Chevron />}
    </>
  );
  if (to)
    return (
      <NavLink to={to} viewTransition className="menu-row">
        {inner}
      </NavLink>
    );
  return (
    <button type="button" className={'menu-row' + (danger ? ' is-danger' : '')} onClick={onClick}>
      {inner}
    </button>
  );
}

// ── 선생님 화면 틀 ─────────────────────────────────────

export function TeacherShell({ children, today }: { children: ReactNode; today: string }) {
  const { me, academy, logout } = useAuth();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const dash = useApi<TeacherDashboard>('/dashboard').data;
  useEffect(() => setMore(false), [loc.pathname]);
  useEffect(() => {
    // 자주 가는 화면 데이터를 미리 받아 두면 화면 전환이 끊기지 않는다
    const g = monthGrid(today.slice(0, 8) + '01');
    prefetch(['/students', '/makeups', '/groups', '/textbooks', '/consults', '/feedback', `/calendar?from=${g[0]}&to=${g[41]}`]);
  }, [today]);

  const nav: NavItem[] = [
    { to: '/', label: '오늘', end: true, icon: I.today },
    { to: '/calendar', label: '달력', icon: I.cal },
    { to: '/students', label: '학생', icon: I.students },
    { to: '/makeups', label: '보강', icon: I.makeup, badge: dash?.pendingMakeups.length },
    { to: '/feedback', label: '피드백', icon: I.feedback },
    { to: '/books', label: '교재', icon: I.books },
    { to: '/groups', label: '반 · 시간표', icon: I.groups },
    { to: '/consults', label: '상담 신청', icon: I.consult, badge: dash?.newConsults.length },
    { to: '/settings', label: '설정', icon: I.settings },
  ];
  const tabs = nav.slice(0, 4);
  const rest = nav.slice(4);
  const inMore = rest.some((i) => loc.pathname.startsWith(i.to));

  return (
    <div className="shell shell-teacher">
      <aside className="sidebar">
        <NavLink to="/" viewTransition className="sidebar-brand">
          <Brand name={academy.name} />
        </NavLink>
        <nav className="side-nav">
          {nav.map((i) => (
            <NavItemLink key={i.to} item={i} cls="side-link" pillName="side-pill" />
          ))}
        </nav>
        <div className="sidebar-foot">
          <Avatar name={me?.name ?? ''} size="sm" />
          <span className="who">
            {me?.name}
            <small>{me?.isAdmin ? '원장' : '선생님'}</small>
          </span>
          <button type="button" className="icon-btn" onClick={logout} aria-label="로그아웃" title="로그아웃">
            <span className="nav-ico">{I.logout}</span>
          </button>
        </div>
      </aside>
      <header className="topbar">
        <NavLink to="/" viewTransition>
          <Brand name={academy.name} scale={0.9} />
        </NavLink>
        <span className="topbar-date">{mdw(today)}</span>
      </header>
      <main className="main">
        <div className="main-in">{children}</div>
      </main>
      <TabBar items={tabs} more={() => setMore(true)} moreOn={inMore} />
      <Sheet open={more} onClose={() => setMore(false)} title="더보기" width={420}>
        <div className="menu">
          {rest.map((i) => (
            <MenuRow key={i.to} to={i.to} icon={i.icon} label={i.label} aside={i.badge ? <span className="nav-badge">{i.badge}</span> : undefined} />
          ))}
        </div>
        <div className="menu">
          <MenuRow icon={I.logout} label="로그아웃" onClick={logout} danger aside={me?.name} />
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
  const isParent = me?.role === 'parent';

  return (
    <ChildCtx.Provider value={{ child, children: kids, setChild: switchTo }}>
      <div className="shell shell-family">
        <header className="globalnav">
          <div className="globalnav-in">
            <NavLink to="/" viewTransition className="gn-brand">
              <Brand name={academy.name} scale={0.9} />
            </NavLink>
            <nav className="gn-links">
              {FAMILY_NAV.map((i) => (
                <NavItemLink key={i.to} item={i} cls="gn-link" pillName="gn-pill" />
              ))}
            </nav>
            <div className="gn-end">
              {kids.length > 1 && (
                <div className="kid-switch" role="tablist" aria-label="자녀 선택">
                  {kids.map((k) => (
                    <button key={k.id} type="button" role="tab" aria-selected={k.id === child?.id} className={k.id === child?.id ? 'is-on' : ''} onClick={() => switchTo(k.id)}>
                      {k.id === child?.id && <span className="kid-pill" style={{ viewTransitionName: 'kid-pill' }} />}
                      <span className="kid-name">{k.name.length === 3 ? k.name.slice(1) : k.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="gn-me" onClick={() => setMenu(true)} aria-label="내 계정">
                <Avatar name={me?.name ?? ''} size="sm" />
              </button>
            </div>
          </div>
        </header>
        <main className="fam-main">
          <div className="main-in">{child ? children : <div className="empty"><p className="empty-title">연결된 학생이 없습니다.</p><div className="empty-body">학원에 문의해 주세요.</div></div>}</div>
        </main>
        <TabBar items={FAMILY_NAV} />
        <Sheet open={menu} onClose={() => setMenu(false)} title={me?.name + (isParent ? ' 학부모님' : '')} width={420}>
          {kids.length > 1 && (
            <div className="menu">
              {kids.map((k) => (
                <button key={k.id} type="button" className={'menu-row' + (k.id === child?.id ? ' is-on' : '')} onClick={() => switchTo(k.id)}>
                  <Avatar name={k.name} size="sm" />
                  <span className="menu-label">
                    {k.name}
                    <small>{[k.school, k.grade].filter(Boolean).join(' ')}</small>
                  </span>
                  {k.id === child?.id && (
                    <svg className="menu-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="menu">
            <MenuRow to="/account" icon={I.account} label="비밀번호 바꾸기" />
            <MenuRow icon={I.logout} label="로그아웃" onClick={logout} danger />
          </div>
          {(academy.phone || academy.address) && (
            <p className="menu-foot">
              {academy.name}
              {academy.phone && (
                <>
                  {' · '}
                  <a href={`tel:${academy.phone}`}>{academy.phone}</a>
                </>
              )}
              {academy.address && (
                <>
                  <br />
                  {academy.address}
                </>
              )}
            </p>
          )}
        </Sheet>
      </div>
    </ChildCtx.Provider>
  );
}
