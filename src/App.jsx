import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ScrollToTop from './components/layout/ScrollToTop';
import AnalyticsRouteListener from './components/layout/AnalyticsRouteListener';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Teams from './pages/Teams';
import TeamPage from './components/team/TeamPage';
import Games from './pages/Games';
import Insights from './pages/Insights';
import NewsFeed from './pages/NewsFeed';
import Alerts from './pages/Alerts';
import SharePage from './pages/SharePage';
import Settings from './pages/Settings';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Contact from './pages/Contact';
import Dashboard from './pages/Dashboard';
import ToastContainer from './components/common/Toast';
import { AuthProvider } from './context/AuthContext';
import { initOfficialBracket } from './utils/bracketInit';

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
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="teams" element={<Teams />} />
              <Route path="teams/:slug" element={<TeamPage />} />
              <Route path="games" element={<Games />} />
              <Route path="insights" element={<Insights />} />
              {/* Redirect legacy /odds-insights to canonical /insights */}
              <Route path="odds-insights" element={<Navigate to="/insights" replace />} />
              <Route path="news" element={<NewsFeed />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="settings" element={<Settings />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="contact" element={<Contact />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="college-basketball-picks-today" element={<Suspense fallback={null}><CollegeBasketballPicksToday /></Suspense>} />
              <Route path="march-madness-betting-intelligence" element={<Suspense fallback={null}><MarchMadnessHub /></Suspense>} />
              <Route path="bracketology" element={<Suspense fallback={null}><Bracketology /></Suspense>} />
              <Route path="friends" element={<Suspense fallback={null}><Friends /></Suspense>} />
              <Route path="join" element={<Suspense fallback={null}><Join /></Suspense>} />
              <Route path="games/:matchupSlug" element={<Suspense fallback={null}><GameMatchup /></Suspense>} />
            </Route>
            {/* Share pages: handled by /api/share/render in prod; SPA fallback in dev */}
            <Route path="share/:id" element={<SharePage />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
