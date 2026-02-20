import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Teams from './pages/Teams';
import TeamPage from './components/team/TeamPage';
import Games from './pages/Games';
import Insights from './pages/Insights';
import Alerts from './pages/Alerts';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="teams" element={<Teams />} />
          <Route path="teams/:slug" element={<TeamPage />} />
          <Route path="games" element={<Games />} />
          <Route path="insights" element={<Insights />} />
          <Route path="alerts" element={<Alerts />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
