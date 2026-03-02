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
import ToastContainer from './components/common/Toast';
import { AuthProvider } from './context/AuthContext';

export default function App() {
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
            </Route>
            {/* Share pages: handled by /api/share/render in prod; SPA fallback in dev */}
            <Route path="share/:id" element={<SharePage />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
