/**
 * MlbPinnedTeamSection — NCAAM-style "Pin a team" for MLB Home.
 *
 * Two states:
 * 1. Empty: left explainer panel + right Yankees preview card
 * 2. Filled: grid of MLB pinned team cards (NCAAM card structure)
 *
 * Mirrors NCAAM PinnedTeamsSection pattern with MLB-specific data.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { getTeamProjection } from '../../data/mlb/seasonModel';
import { getTeamMeta } from '../../data/mlb/teamMeta';
import { buildMlbTeamIntelSummary } from '../../data/mlb/teamIntelSummary';
import usePinnedTeams from '../../hooks/usePinnedTeams';
import { usePlan } from '../../hooks/usePlan';
import { MLB_TEAMS, getMLBEspnId } from '../../sports/mlb/teams';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import MlbTeamPickerModal from './MlbTeamPickerModal';
import styles from './MlbPinnedTeamSection.module.css';

const FREE_PIN_LIMIT = 3;

const DEFAULT_SLUG = 'nyy';

function formatOdds(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }

function formatRelTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
}

/* ─── Preview Card (empty state right side) ─── */
function PreviewCard({ slug, odds, onPin, buildPath }) {
  const team = MLB_TEAMS.find(t => t.slug === slug);
  const proj = getTeamProjection(slug);
  const meta = getTeamMeta(slug);
  const logo = team ? getMlbEspnLogoUrl(team.slug) : null;
  const teamOdds = odds?.[slug];
  if (!team) return null;

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>Preview</span>
        <button type="button" className={styles.previewClose} aria-label="Dismiss preview">×</button>
      </div>
      <div className={styles.previewIdentity}>
        {logo && <img src={logo} alt="" className={styles.previewLogo} width={36} height={36} />}
        <div>
          <span className={styles.previewName}>{team.name}</span>
          <span className={styles.previewDiv}>{team.division}</span>
        </div>
      </div>
      {proj && (
        <div className={styles.previewStats}>
          <div className={styles.previewStat}>
            <span className={styles.previewStatLabel}>Projected</span>
            <span className={styles.previewStatValue}>{proj.projectedWins}W</span>
          </div>
          {teamOdds && (
            <div className={styles.previewStat}>
              <span className={styles.previewStatLabel}>WS Odds</span>
              <span className={styles.previewStatValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
            </div>
          )}
          <div className={styles.previewStat}>
            <span className={styles.previewStatLabel}>2025</span>
            <span className={styles.previewStatValue}>{meta.record2025}</span>
          </div>
        </div>
      )}
      <div className={styles.previewActions}>
        <button type="button" className={styles.pinBtnPrimary} onClick={() => onPin(slug)}>
          📌 Pin {team.name.split(' ').pop()}
        </button>
        <Link to={buildPath(`/teams/${slug}`)} className={styles.viewProfileLink}>
          View Team Intel →
        </Link>
      </div>
    </div>
  );
}

/* ─── Pinned Team Card (filled state) ─── */
function PinnedCard({ slug, odds, schedule, onRemove, buildPath }) {
  const team = MLB_TEAMS.find(t => t.slug === slug);
  const proj = getTeamProjection(slug);
  const meta = getTeamMeta(slug);
  const logo = team ? getMlbEspnLogoUrl(team.slug) : null;
  const teamOdds = odds?.[slug];
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    if (!team) return;
    fetch(`/api/mlb/youtube/intelFeed?maxResults=16`)
      .then(r => r.json())
      .then(d => {
        const items = d.items ?? [];
        const teamName = team.name.toLowerCase();
        const nameParts = teamName.split(' ');
        const mascot = nameParts[nameParts.length - 1]; // e.g. "giants"
        const city = nameParts.slice(0, -1).join(' '); // e.g. "san francisco"
        const abbrev = (team.abbrev || '').toLowerCase(); // e.g. "sf"

        // Score each video for team relevance
        const scored = items.map(v => {
          const t = (v.title || '').toLowerCase();
          const desc = (v.description || '').toLowerCase();
          let score = 0;
          // Tier 1: full team name in title
          if (t.includes(teamName)) score += 10;
          // Tier 2: mascot in title (>3 chars to avoid false positives)
          else if (mascot.length > 3 && t.includes(mascot)) score += 6;
          // Tier 2b: city in title (>3 chars)
          if (city.length > 3 && t.includes(city)) score += 4;
          // Tier 3: abbrev in title context (e.g. "SF" surrounded by non-alpha)
          if (abbrev.length >= 2) {
            const abbrRe = new RegExp(`\\b${abbrev}\\b`, 'i');
            if (abbrRe.test(v.title || '')) score += 3;
          }
          // Tier 3b: team name in description
          if (desc.includes(teamName) || (mascot.length > 3 && desc.includes(mascot))) score += 2;
          return { ...v, _score: score };
        });

        // Filter: must have score > 0 (some team relevance)
        const teamVids = scored
          .filter(v => v._score > 0)
          .sort((a, b) => {
            if (a._score !== b._score) return b._score - a._score;
            return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
          });

        setVideos(teamVids.slice(0, 1));
      })
      .catch(() => {});
  }, [team]);

  if (!team) return null;

  // Generate premium intel writeup
  const intel = useMemo(() => buildMlbTeamIntelSummary({
    team, projection: proj, meta, odds: odds?.[slug] ? { bestChanceAmerican: odds[slug].bestChanceAmerican } : null,
    currentRecord: (() => {
      if (!Array.isArray(schedule) || !schedule.length) return '0-0';
      const f = schedule.filter(e => e.isFinal && e.ourScore != null && e.oppScore != null);
      return `${f.filter(e => e.ourScore > e.oppScore).length}-${f.filter(e => e.ourScore < e.oppScore).length}`;
    })(),
  }), [team, proj, meta, odds, slug, schedule]);

  // Find next game from schedule (null = loading, [] = no data)
  const nextGame = useMemo(() => {
    if (!Array.isArray(schedule) || schedule.length === 0) return null;
    const upcoming = schedule.filter(e => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming[0] || null;
  }, [schedule]);

  // Current record from schedule
  const currentRecord = useMemo(() => {
    if (!schedule?.length) return '0-0';
    const finals = schedule.filter(e => e.isFinal && e.ourScore != null && e.oppScore != null);
    const w = finals.filter(e => e.ourScore > e.oppScore).length;
    const l = finals.filter(e => e.ourScore < e.oppScore).length;
    return `${w}-${l}`;
  }, [schedule]);

  const handleShare = () => {
    const url = `${window.location.origin}/mlb/teams/${slug}`;
    navigator.clipboard?.writeText(url).catch(() => {});
  };

  return (
    <div className={styles.pinnedCard}>
      {/* Header */}
      <div className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          {logo && <img src={logo} alt="" className={styles.cardLogo} width={32} height={32} />}
          <div>
            <Link to={buildPath(`/teams/${slug}`)} className={styles.cardName}>{team.name}</Link>
            <span className={styles.cardDiv}>{team.division}</span>
          </div>
        </div>
        <div className={styles.cardActions}>
          <button type="button" className={styles.cardActionBtn} onClick={handleShare} title="Share">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          <button type="button" className={styles.cardActionBtn} onClick={() => onRemove(slug)} title="Remove">×</button>
        </div>
      </div>

      {/* 4 stat boxes */}
      <div className={styles.statBoxes}>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>2025 Record</span>
          <span className={styles.statBoxValue}>{meta.record2025}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Finish</span>
          <span className={styles.statBoxValue}>{meta.finish}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Proj. Wins</span>
          <span className={styles.statBoxValue}>{proj?.projectedWins ?? '—'}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Current</span>
          <span className={styles.statBoxValue}>{currentRecord}</span>
        </div>
      </div>

      {/* Next matchup */}
      {nextGame && (
        <div className={styles.nextGame}>
          <span className={styles.nextGameLabel}>
            {nextGame.seasonTypeName === 'preseason' ? 'Spring Training' : 'Next Game'}
          </span>
          <div className={styles.nextGameInfo}>
            <span>{nextGame.homeAway === 'home' ? 'vs' : '@'} {nextGame.opponent}</span>
            <span className={styles.nextGameTime}>{formatRelTime(nextGame.date)}</span>
            {nextGame.network && <span className={styles.nextGameNetwork}>{nextGame.network}</span>}
          </div>
          {nextGame.gamecastUrl && (
            <a href={nextGame.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.gamecastLink}>
              Gamecast ↗
            </a>
          )}
        </div>
      )}

      {/* Intel writeup */}
      <p className={styles.intelText}>{intel}</p>

      {/* Hero video */}
      {videos[0] && (
        <a href={`https://www.youtube.com/watch?v=${videos[0].videoId}`}
          target="_blank" rel="noopener noreferrer" className={styles.heroVideo}>
          <div className={styles.heroVideoThumb}>
            <img src={videos[0].thumbUrl} alt={videos[0].title} loading="lazy" />
            <span className={styles.playIcon}>▶</span>
          </div>
          <span className={styles.heroVideoTitle}>{videos[0].title}</span>
        </a>
      )}

      {/* CTA */}
      <Link to={buildPath(`/teams/${slug}`)} className={styles.viewTeamCta}>
        View Team Intel →
      </Link>
    </div>
  );
}

/* ─── Main Section ─── */
export default function MlbPinnedTeamSection() {
  const { user } = useAuth();
  const { buildPath } = useWorkspace();
  const navigate = useNavigate();
  const { pinnedTeams: pinned, addTeam, removeTeam } = usePinnedTeams({ sport: 'mlb' });
  const { isPro } = usePlan();
  const [odds, setOdds] = useState(null);
  const [schedules, setSchedules] = useState({});
  const [limitHit, setLimitHit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetchMlbChampionshipOdds().then(d => setOdds(d.odds ?? {})).catch(() => {});
  }, []);

  // Fetch schedules — use functional state check to avoid stale closure
  useEffect(() => {
    if (pinned.length === 0) return;
    pinned.forEach(slug => {
      setSchedules(prev => {
        if (prev[slug]) return prev; // already fetched
        const espnId = getMLBEspnId(slug);
        if (!espnId) return prev;
        // Fire fetch, update state when done
        fetch(`/api/mlb/team/schedule?teamId=${espnId}`)
          .then(r => r.json())
          .then(d => setSchedules(p => ({ ...p, [slug]: d.events ?? [] })))
          .catch(() => {});
        return { ...prev, [slug]: null }; // mark as loading to prevent re-fetch
      });
    });
  }, [pinned]);

  const handlePin = (slug) => {
    if (!user) { navigate('/settings'); return; }
    if (!isPro && pinned.length >= FREE_PIN_LIMIT) {
      setLimitHit(true);
      return;
    }
    addTeam(slug);
    setLimitHit(false);
  };

  const handleRemove = (slug) => {
    removeTeam(slug);
    setLimitHit(false);
  };

  const isEmpty = pinned.length === 0;

  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>Following</div>
      <h2 className={styles.heading}>Teams You Follow</h2>

      {isEmpty ? (
        /* ── Empty state: two-column layout ── */
        <div className={styles.emptyLayout}>
          <div className={styles.explainer}>
            <h3 className={styles.explainerTitle}>Pin teams to track them faster</h3>
            <ul className={styles.explainerList}>
              <li>Faster home dashboard tailored to you</li>
              <li>Instant access to projected wins, odds, and team intel</li>
              <li>Keep tabs on current form and next matchup</li>
              <li>Your personal MLB watchlist</li>
            </ul>
            <div className={styles.explainerActions}>
              <button type="button" className={styles.pinBtnPrimary} onClick={() => handlePin(DEFAULT_SLUG)}>
                📌 Pin Yankees (example)
              </button>
              <button type="button" className={styles.addTeamBtn} onClick={() => {
                if (!user) { navigate('/settings'); return; }
                setPickerOpen(true);
              }}>
                + Add team
              </button>
            </div>
            <p className={styles.explainerHelper}>
              Search for any MLB team. Try: Dodgers, Braves, Mets…
            </p>
            <div className={styles.popularChips}>
              <span className={styles.popularLabel}>Popular:</span>
              {['lad', 'atl', 'phi', 'hou'].map(s => {
                const t = MLB_TEAMS.find(x => x.slug === s);
                return t ? (
                  <button key={s} type="button" className={styles.popularChip}
                    onClick={() => handlePin(s)}>{t.name.split(' ').pop()}</button>
                ) : null;
              })}
            </div>
          </div>
          <PreviewCard slug={DEFAULT_SLUG} odds={odds} onPin={handlePin} buildPath={buildPath} />
        </div>
      ) : (
        /* ── Filled state: pinned cards grid + Add Team ── */
        <>
          <div className={styles.pinnedHeader}>
            <span className={styles.pinnedLabel}>Pinned Teams</span>
            <button type="button" className={styles.addTeamCta} onClick={() => {
              if (!user) { navigate('/settings'); return; }
              setPickerOpen(true);
            }}>+ Add Team</button>
          </div>
          {limitHit && (
            <div className={styles.limitMsg}>
              <span>You&apos;ve reached the free limit of {FREE_PIN_LIMIT} teams.</span>
              <Link to="/settings" className={styles.upgradeLink}>Upgrade to Pro →</Link>
            </div>
          )}
          <div className={styles.pinnedGrid}>
            {pinned.map(slug => (
              <PinnedCard key={slug} slug={slug} odds={odds}
                schedule={schedules[slug]} onRemove={handleRemove} buildPath={buildPath} />
            ))}
          </div>
        </>
      )}
      {/* Team picker modal */}
      <MlbTeamPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        pinnedTeams={pinned}
        addTeam={addTeam}
        removeTeam={removeTeam}
        isPinned={(slug) => pinned.includes(slug)}
        isPro={isPro}
      />
    </section>
  );
}
