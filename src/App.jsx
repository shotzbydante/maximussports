import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ScrollToTop from './components/layout/ScrollToTop';
import AnalyticsRouteListener from './components/layout/AnalyticsRouteListener';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import ToastContainer from './components/common/Toast';
import { AuthProvider } from './context/AuthContext';
import { initOfficialBracket } from './utils/bracketInit';
import { WorkspaceProvider } from './workspaces/WorkspaceContext';
import WorkspaceGate from './workspaces/WorkspaceGate';
import { WorkspaceId } from './workspaces/config';

const Teams       = lazy(() => import('./pages/Teams'));
const TeamPage    = lazy(() => import('./components/team/TeamPage'));
const Games       = lazy(() => import('./pages/Games'));
const Insights    = lazy(() => import('./pages/Insights'));
const NewsFeed    = lazy(() => import('./pages/NewsFeed'));
const Alerts      = lazy(() => import('./pages/Alerts'));
const SharePage   = lazy(() => import('./pages/SharePage'));
const Settings    = lazy(() => import('./pages/Settings'));
const Privacy     = lazy(() => import('./pages/Privacy'));
const Terms       = lazy(() => import('./pages/Terms'));
const Contact     = lazy(() => import('./pages/Contact'));
const Dashboard   = lazy(() => import('./pages/Dashboard'));

const MlbHome       = lazy(() => import('./pages/mlb/MlbHome'));
const MlbGames      = lazy(() => import('./pages/mlb/MlbGames'));
const MlbTeams      = lazy(() => import('./pages/mlb/MlbTeams'));
const MlbTeamDetail = lazy(() => import('./pages/mlb/MlbTeamDetail'));
const MlbNewsFeed   = lazy(() => import('./pages/mlb/MlbNewsFeed'));
const MlbPicks      = lazy(() => import('./pages/mlb/MlbPicks'));

const CollegeBasketballPicksToday = lazy(() => import('./pages/CollegeBasketballPicksToday'));
const MarchMadnessHub = lazy(() => import('./pages/MarchMadnessHub'));
const GameMatchup = lazy(() => import('./pages/GameMatchup'));
const Bracketology = lazy(() => import('./pages/Bracketology'));
const Friends = lazy(() => import('./pages/Friends'));
const Join = lazy(() => import('./pages/Join'));

export default function App() {
  useEffect(() => { initOfficialBracket(); }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AnalyticsRouteListener />
        <ToastContainer />
        <ErrorBoundary>
          <WorkspaceProvider>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Layout />}>
                  {/* ── NCAAM routes (default workspace, existing paths) ── */}
                  <Route index element={<Home />} />
                  <Route path="teams" element={<Teams />} />
                  <Route path="teams/:slug" element={<TeamPage />} />
                  <Route path="games" element={<Games />} />
                  <Route path="insights" element={<Insights />} />
                  <Route path="odds-insights" element={<Navigate to="/insights" replace />} />
                  <Route path="news" element={<NewsFeed />} />
                  <Route path="alerts" element={<Alerts />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="privacy" element={<Privacy />} />
                  <Route path="terms" element={<Terms />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="college-basketball-picks-today" element={<CollegeBasketballPicksToday />} />
                  <Route path="march-madness-betting-intelligence" element={<MarchMadnessHub />} />
                  <Route path="bracketology" element={<Bracketology />} />
                  <Route path="friends" element={<Friends />} />
                  <Route path="join" element={<Join />} />
                  <Route path="games/:matchupSlug" element={<GameMatchup />} />

                  {/* ── MLB routes (gated workspace) ── */}
                  <Route path="mlb" element={<WorkspaceGate workspaceId={WorkspaceId.MLB} />}>
                    <Route index element={<MlbHome />} />
                    <Route path="games" element={<MlbGames />} />
                    <Route path="teams" element={<MlbTeams />} />
                    <Route path="teams/:slug" element={<MlbTeamDetail />} />
                    <Route path="news" element={<MlbNewsFeed />} />
                    <Route path="insights" element={<MlbPicks />} />
                  </Route>
                </Route>
                <Route path="share/:id" element={<SharePage />} />
              </Routes>
            </Suspense>
          </WorkspaceProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
