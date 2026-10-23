import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { UiProvider, Loading } from './components/ui';
import { FamilyShell, TeacherShell } from './components/Shell';
import { LoginPage, SetupPage } from './pages/Login';
import { FamilyBooksPage, FamilyCalendarPage, FamilyFeedbackPage, FamilyHomePage } from './pages/family/FamilyPages';
import { TodayPage } from './pages/teacher/TodayPage';
import { TeacherCalendarPage } from './pages/teacher/CalendarPage';
import { MakeupsPage } from './pages/teacher/MakeupsPage';
import { StudentDetailPage, StudentsPage } from './pages/teacher/StudentPages';
import { TeacherFeedbackPage } from './pages/teacher/FeedbackPages';
import { AccountPage, BooksPage, GroupsPage, SettingsPage } from './pages/teacher/MorePages';
import { todayIn } from '../shared/date';

function Gate() {
  const { me, ready, needsSetup } = useAuth();
  if (!ready) return <Loading />;
  if (!me) return needsSetup ? <SetupPage /> : <LoginPage />;

  if (me.role === 'teacher') {
    return (
      <TeacherShell today={todayIn()}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/calendar" element={<TeacherCalendarPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/makeups" element={<MakeupsPage />} />
          <Route path="/feedback" element={<TeacherFeedbackPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TeacherShell>
    );
  }

  return (
    <FamilyShell>
      <Routes>
        <Route path="/" element={<FamilyHomePage />} />
        <Route path="/calendar" element={<FamilyCalendarPage />} />
        <Route path="/feedback" element={<FamilyFeedbackPage />} />
        <Route path="/books" element={<FamilyBooksPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FamilyShell>
  );
}

// 미리보기(데모) 빌드는 단일 파일이라 주소 대신 # 경로를 쓴다
const Router = import.meta.env.MODE === 'demo' ? HashRouter : BrowserRouter;

export function App({ banner }: { banner?: React.ReactNode }) {
  return (
    <Router>
      <AuthProvider>
        <UiProvider>
          {banner}
          <Gate />
        </UiProvider>
      </AuthProvider>
    </Router>
  );
}
