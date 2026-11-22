/**
 * NbaSectionTabs — the row of pills that moves between the NBA pages on
 * phones and tablets, the same control the NFL pages use.
 */

import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import h from '../../nfl/home/home.module.css';

const TABS = [
  { path: '', label: 'Today', end: true },
  { path: '/games', label: 'Games' },
  { path: '/insights', label: 'Picks' },
  { path: '/teams', label: 'Teams' },
  { path: '/news', label: 'News' },
];

export default function NbaSectionTabs() {
  const { buildPath } = useWorkspace();
  return (
    <nav className={h.tabs} aria-label="NBA sections">
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
