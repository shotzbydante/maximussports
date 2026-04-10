import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ScrollToTop from './components/layout/ScrollToTop';
import AnalyticsRouteListener from './components/layout/AnalyticsRouteListener';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Landing from './pages/Landing';
import ToastContainer from './components/common/Toast';
import { AuthProvider } from './context/AuthContext';
import { initOfficialBracket } from './utils/bracketInit';
import { WorkspaceProvider } from './workspaces/WorkspaceContext';
import WorkspaceGate from './workspaces/WorkspaceGate';
import { WorkspaceId } from './workspaces/config';
import RouteGate from './components/common/RouteGate';

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

const NbaHome       = lazy(() => import('./pages/nba/NbaHome'));
const NbaGames      = lazy(() => import('./pages/nba/NbaGames'));
const NbaTeams      = lazy(() => import('./pages/nba/NbaTeams'));
const NbaTeamDetail = lazy(() => import('./pages/nba/NbaTeamDetail'));
const NbaNewsFeed   = lazy(() => import('./pages/nba/NbaNewsFeed'));
const NbaPicks      = lazy(() => import('./pages/nba/NbaPicks'));
const NbaSeasonIntel = lazy(() => import('./pages/nba/NbaSeasonIntel'));

const RenderMlbDaily = lazy(() => import('./pages/RenderMlbDaily'));
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
                  {/* ══ Root homepage — brand landing page ══ */}
                  <Route index element={<Landing />} />

                  {/* ══ NCAAM routes (canonical: /ncaam/...) ══ */}
                  <Route path="ncaam">
                    <Route index element={<RouteGate><Home /></RouteGate>} />
                    <Route path="teams" element={<RouteGate><Teams /></RouteGate>} />
                    <Route path="teams/:slug" element={<RouteGate><TeamPage /></RouteGate>} />
                    <Route path="games" element={<RouteGate><Games /></RouteGate>} />
                    <Route path="insights" element={<RouteGate><Insights /></RouteGate>} />
                    <Route path="odds-insights" element={<Navigate to="/ncaam/insights" replace />} />
                    <Route path="news" element={<RouteGate><NewsFeed /></RouteGate>} />
                    <Route path="alerts" element={<RouteGate><Alerts /></RouteGate>} />
                    <Route path="bracketology" element={<RouteGate><Bracketology /></RouteGate>} />
                    <Route path="friends" element={<Friends />} />
                    <Route path="join" element={<Join />} />
                    <Route path="games/:matchupSlug" element={<RouteGate><GameMatchup /></RouteGate>} />
                    <Route path="college-basketball-picks-today" element={<RouteGate><CollegeBasketballPicksToday /></RouteGate>} />
                    <Route path="march-madness-betting-intelligence" element={<RouteGate><MarchMadnessHub /></RouteGate>} />
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
                    <Route index element={<RouteGate><MlbHome /></RouteGate>} />
                    <Route path="games" element={<RouteGate><MlbGames /></RouteGate>} />
                    <Route path="teams" element={<RouteGate><MlbTeams /></RouteGate>} />
                    <Route path="teams/:slug" element={<RouteGate><MlbTeamDetail /></RouteGate>} />
                    <Route path="news" element={<RouteGate><MlbNewsFeed /></RouteGate>} />
                    <Route path="insights" element={<RouteGate><MlbPicks /></RouteGate>} />
                    <Route path="season-model" element={<RouteGate><MlbSeasonModel /></RouteGate>} />
                    <Route path="compare" element={<RouteGate><MlbCompare /></RouteGate>} />
                    <Route path="dashboard" element={<Navigate to="/dashboard" replace />} />
                    <Route path="settings" element={<Navigate to="/settings" replace />} />
                  </Route>

                  {/* ══ NBA routes (admin-gated workspace: /nba/...) ══ */}
                  <Route path="nba" element={<WorkspaceGate workspaceId={WorkspaceId.NBA} />}>
                    <Route index element={<NbaHome />} />
                    <Route path="games" element={<NbaGames />} />
                    <Route path="teams" element={<NbaTeams />} />
                    <Route path="teams/:slug" element={<NbaTeamDetail />} />
                    <Route path="news" element={<NbaNewsFeed />} />
                    <Route path="insights" element={<NbaPicks />} />
                    <Route path="season-intel" element={<NbaSeasonIntel />} />
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
                {/* Hidden render page — headless browser screenshot target for autopost */}
                <Route path="render/mlb-daily" element={<RenderMlbDaily />} />
              </Routes>
            </Suspense>
          </WorkspaceProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
