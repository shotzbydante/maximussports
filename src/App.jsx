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
const MlbPicks        = lazy(() => import('./pages/mlb/MlbPicks'));
const MlbSeasonModel  = lazy(() => import('./pages/mlb/MlbSeasonModel'));
const MlbCompare      = lazy(() => import('./pages/mlb/MlbCompare'));

const CollegeBasketballPicksToday = lazy(() => import('./pages/CollegeBasketballPicksToday'));
const MarchMadnessHub = lazy(() => import('./pages/MarchMadnessHub'));
const GameMatchup = lazy(() => import('./pages/GameMatchup'));
const Bracketology = lazy(() => import('./pages/Bracketology'));
const Friends = lazy(() => import('./pages/Friends'));
const Join = lazy(() => import('./pages/Join'));

/**
 * LegacyRedirect — redirects old root NCAAM paths to /ncaam/...
 * Preserves search params and hash.
 */
function LegacyRedirect({ to }) {
  return <Navigate to={to} replace />;
}

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
                  {/* ══ Root redirect → NCAAM ══ */}
                  <Route index element={<Navigate to="/ncaam" replace />} />

                  {/* ══ NCAAM routes (canonical: /ncaam/...) ══ */}
                  <Route path="ncaam">
                    <Route index element={<Home />} />
                    <Route path="teams" element={<Teams />} />
                    <Route path="teams/:slug" element={<TeamPage />} />
                    <Route path="games" element={<Games />} />
                    <Route path="insights" element={<Insights />} />
                    <Route path="odds-insights" element={<Navigate to="/ncaam/insights" replace />} />
                    <Route path="news" element={<NewsFeed />} />
                    <Route path="alerts" element={<Alerts />} />
                    <Route path="bracketology" element={<Bracketology />} />
                    <Route path="friends" element={<Friends />} />
                    <Route path="join" element={<Join />} />
                    <Route path="games/:matchupSlug" element={<GameMatchup />} />
                    <Route path="college-basketball-picks-today" element={<CollegeBasketballPicksToday />} />
                    <Route path="march-madness-betting-intelligence" element={<MarchMadnessHub />} />
                    <Route path="dashboard" element={<Navigate to="/dashboard" replace />} />
                    <Route path="settings" element={<Navigate to="/settings" replace />} />
                  </Route>

                  {/* ══ Legacy root NCAAM redirects → /ncaam/... ══ */}
                  <Route path="teams" element={<LegacyRedirect to="/ncaam/teams" />} />
                  <Route path="teams/:slug" element={<LegacyRedirect to="/ncaam/teams" />} />
                  <Route path="games" element={<LegacyRedirect to="/ncaam/games" />} />
                  <Route path="insights" element={<LegacyRedirect to="/ncaam/insights" />} />
                  <Route path="odds-insights" element={<LegacyRedirect to="/ncaam/insights" />} />
                  <Route path="news" element={<LegacyRedirect to="/ncaam/news" />} />
                  <Route path="alerts" element={<LegacyRedirect to="/ncaam/alerts" />} />
                  <Route path="bracketology" element={<LegacyRedirect to="/ncaam/bracketology" />} />
                  <Route path="friends" element={<LegacyRedirect to="/ncaam/friends" />} />
                  <Route path="join" element={<LegacyRedirect to="/ncaam/join" />} />
                  <Route path="games/:matchupSlug" element={<LegacyRedirect to="/ncaam/games" />} />
                  <Route path="college-basketball-picks-today" element={<LegacyRedirect to="/ncaam/college-basketball-picks-today" />} />
                  <Route path="march-madness-betting-intelligence" element={<LegacyRedirect to="/ncaam/march-madness-betting-intelligence" />} />

                  {/* ══ MLB routes (gated workspace: /mlb/...) ══ */}
                  <Route path="mlb" element={<WorkspaceGate workspaceId={WorkspaceId.MLB} />}>
                    <Route index element={<MlbHome />} />
                    <Route path="games" element={<MlbGames />} />
                    <Route path="teams" element={<MlbTeams />} />
                    <Route path="teams/:slug" element={<MlbTeamDetail />} />
                    <Route path="news" element={<MlbNewsFeed />} />
                    <Route path="insights" element={<MlbPicks />} />
                    <Route path="season-model" element={<MlbSeasonModel />} />
                    <Route path="compare" element={<MlbCompare />} />
                    <Route path="dashboard" element={<Navigate to="/dashboard" replace />} />
                    <Route path="settings" element={<Navigate to="/settings" replace />} />
                  </Route>

                  {/* ══ Global / shared routes (no sport prefix) ══ */}
                  <Route path="settings" element={<Settings />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="privacy" element={<Privacy />} />
                  <Route path="terms" element={<Terms />} />
                  <Route path="contact" element={<Contact />} />
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
