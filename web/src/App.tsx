import { NavLink, Navigate, Route, Routes } from 'react-router';
import { useAuth } from './useAuth';
import ChartsPage from './pages/ChartsPage';
import GamesPage from './pages/GamesPage';
import StatsPage from './pages/StatsPage';
import YakumanPage from './pages/YakumanPage';
import RecordPage from './pages/RecordPage';
import ImportPage from './pages/ImportPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const loggedIn = useAuth();
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const navItems = [
  { to: '/', label: '集計グラフ' },
  { to: '/stats', label: '集計表' },
  { to: '/games', label: '記録一覧' },
  { to: '/yakuman', label: '役満一覧' },
  { to: '/record', label: '記録する' },
  { to: '/import', label: 'CSV取込' },
  { to: '/settings', label: '設定' },
];

export default function App() {
  const loggedIn = useAuth();
  return (
    <div className="min-h-screen bg-emerald-50 text-gray-900">
      <header className="bg-emerald-800 text-white shadow">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center gap-x-6 gap-y-2 flex-wrap md:flex-nowrap">
            <h1 className="text-lg font-bold shrink-0">🀄 麻雀スコア記録</h1>
            <span className="ml-auto text-xs text-emerald-200 shrink-0 md:hidden">
              {loggedIn ? '記録者モード' : '閲覧モード'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-x-6 md:mt-0">
            <nav className="flex flex-nowrap gap-1 overflow-x-auto text-sm">
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `shrink-0 rounded px-3 py-1.5 whitespace-nowrap transition ${isActive ? 'bg-emerald-600 font-semibold' : 'hover:bg-emerald-700'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <span className="ml-auto hidden text-xs text-emerald-200 shrink-0 md:block">
              {loggedIn ? '記録者モード' : '閲覧モード'}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<ChartsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/yakuman" element={<YakumanPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/record"
            element={
              <RequireAuth>
                <RecordPage />
              </RequireAuth>
            }
          />
          <Route
            path="/import"
            element={
              <RequireAuth>
                <ImportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
