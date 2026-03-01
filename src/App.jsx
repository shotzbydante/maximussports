import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ScrollToTop from './components/layout/ScrollToTop';
import Home from './pages/Home';
import Teams from './pages/Teams';
import TeamPage from './components/team/TeamPage';
import Games from './pages/Games';
import Insights from './pages/Insights';
import NewsFeed from './pages/NewsFeed';
import Alerts from './pages/Alerts';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
