import { useMemo, type ReactNode } from 'react';
import { createBrowserRouter, createMemoryRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, type RouteObject } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { UiProvider, Loading } from './components/ui';
import { FamilyShell, TeacherShell } from './components/Shell';
import { SetupPage } from './pages/Login';
import { LandingPage } from './pages/Landing';
import { installTilt } from './lib/motion';
import { FamilyBooksPage, FamilyCalendarPage, FamilyFeedbackPage, FamilyHomePage } from './pages/family/FamilyPages';
import { TodayPage } from './pages/teacher/TodayPage';
import { TeacherCalendarPage } from './pages/teacher/CalendarPage';
import { MakeupsPage } from './pages/teacher/MakeupsPage';
import { StudentDetailPage, StudentsPage } from './pages/teacher/StudentPages';
import { TeacherFeedbackPage } from './pages/teacher/FeedbackPages';
import { AccountPage, BooksPage, GroupsPage, SettingsPage } from './pages/teacher/MorePages';
import { ConsultsPage } from './pages/teacher/ConsultsPage';
import { todayIn } from '../shared/date';

installTilt();

/** 같은 주소라도 선생님과 학생·학부모에게 다른 화면을 보여 준다 */
function ByRole({ teacher, family }: { teacher?: ReactNode; family?: ReactNode }) {
  const { me } = useAuth();
  const el = me?.role === 'teacher' ? teacher : family;
  return <>{el ?? <Navigate to="/" replace />}</>;
}

function Gate() {
  const { me, ready, needsSetup } = useAuth();
  let body: ReactNode;
  if (!ready) body = <Loading />;
  else if (!me) body = needsSetup ? <SetupPage /> : <LandingPage />;
  else if (me.role === 'teacher')
    body = (
      <TeacherShell today={todayIn()}>
        <Outlet />
      </TeacherShell>
    );
  else
    body = (
      <FamilyShell>
        <Outlet />
      </FamilyShell>
    );
  return (
    <>
      {body}
      <ScrollRestoration />
    </>
  );
}

function routes(): RouteObject[] {
  return [
    {
      element: (
        <AuthProvider>
          <UiProvider>
            <Gate />
          </UiProvider>
        </AuthProvider>
      ),
      children: [
        { path: '/', element: <ByRole teacher={<TodayPage />} family={<FamilyHomePage />} /> },
        { path: '/calendar', element: <ByRole teacher={<TeacherCalendarPage />} family={<FamilyCalendarPage />} /> },
        { path: '/feedback', element: <ByRole teacher={<TeacherFeedbackPage />} family={<FamilyFeedbackPage />} /> },
        { path: '/books', element: <ByRole teacher={<BooksPage />} family={<FamilyBooksPage />} /> },
        { path: '/students', element: <ByRole teacher={<StudentsPage />} /> },
        { path: '/students/:id', element: <ByRole teacher={<StudentDetailPage />} /> },
        { path: '/makeups', element: <ByRole teacher={<MakeupsPage />} /> },
        { path: '/groups', element: <ByRole teacher={<GroupsPage />} /> },
        { path: '/consults', element: <ByRole teacher={<ConsultsPage />} /> },
        { path: '/settings', element: <ByRole teacher={<SettingsPage />} /> },
        { path: '/account', element: <ByRole family={<AccountPage />} /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ];
}

export function App() {
  // 미리보기 빌드는 한 장짜리 페이지 안에서 돌기 때문에 주소창을 건드리지 않는다
  const router = useMemo(() => (import.meta.env.MODE === 'demo' ? createMemoryRouter(routes()) : createBrowserRouter(routes())), []);
  return <RouterProvider router={router} />;
}
