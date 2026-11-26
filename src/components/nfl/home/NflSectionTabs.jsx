/**
 * NflSectionTabs — the row of pills that moves between the NFL pages on
 * phones and tablets. Hidden once the top navigation shows the same links.
 */

import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import h from './home.module.css';

const TABS = [
  { path: '', label: 'This week', end: true },
  { path: '/games', label: 'Games' },
  { path: '/insights', label: 'Picks' },
  { path: '/ask', label: 'Ask' },
  { path: '/teams', label: 'Teams' },
  { path: '/news', label: 'News' },
  { path: '/season-model', label: 'Season' },
];

export default function NflSectionTabs() {
  const { buildPath } = useWorkspace();
  return (
    <nav className={h.tabs} aria-label="NFL sections">
      {TABS.map((t) => (
        <NavLink
          key={t.label}
          to={buildPath(t.path)}
          end={t.end}
          className={({ isActive }) => `${h.tab} ${isActive ? h.tabOn : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
