/**
 * NbaBrief — the brief on the NBA home page, the same shape as the NFL one.
 *
 * A headline for this minute, then two short lists you can flip between
 * (what is live, what is next), three numbers, and Maximus's own read. The
 * copy comes from /api/nba/chat/homeSummary; the scores and tip times
 * beside each line come from the live games feed, so they are current even
 * when the copy is a few minutes old.
 */

import { useState } from 'react';
import { mascotFor } from '../../../brand/mascots';
import { NbaLogo, TeamText } from './NbaTeamTag';
import { statusText, tipShort } from './nbaFormat';
import h from '../../nfl/home/home.module.css';

function updatedText(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

function LiveHead({ game }) {
  const { away, home } = game.teams;
  return (
    <div className={h.brRowHead}>
      <span className={h.ipScore}>
        <NbaLogo slug={away.slug} src={away.logo} size={18} />
        <span>{away.abbrev}</span><b>{away.score ?? ''}</b>
        <NbaLogo slug={home.slug} src={home.logo} size={18} />
        <span>{home.abbrev}</span><b>{home.score ?? ''}</b>
      </span>
      {game.status === 'final'
        ? <span className={h.small}>{statusText(game)}</span>
        : <span className={`${h.chip} ${h.chipLive}`}><span className={h.dot} aria-hidden="true" />{statusText(game)}</span>}
    </div>
  );
}

function NextHead({ game }) {
  const { away, home } = game.teams;
  return (
    <div className={h.brRowHead}>
      <span className={h.ipScore}>
        <NbaLogo slug={away.slug} src={away.logo} size={18} />
        <span>{away.abbrev}</span>
        <span className={h.small}>at</span>
        <NbaLogo slug={home.slug} src={home.logo} size={18} />
        <span>{home.abbrev}</span>
      </span>
      <span className={h.small}>{[tipShort(game.startTime), game.broadcast?.network].filter(Boolean).join(', ')}</span>
    </div>
  );
}

function Items({ items, games, kind }) {
  return (
    <ul className={h.brList}>
      {items.map((item) => {
        const game = games.get(String(item.gameId));
        return (
          <li key={item.gameId} className={h.brRow}>
            {game && (kind === 'now' && game.status !== 'upcoming' ? <LiveHead game={game} /> : <NextHead game={game} />)}
            <p className={h.brText}><TeamText text={item.text} abbrev size={14} /></p>
          </li>
        );
      })}
    </ul>
  );
}

export default function NbaBrief({ brief, games = [], generatedAt, onRefresh, refreshing }) {
  const byId = new Map(games.map((g) => [String(g.gameId), g]));
  // A line about a game is only shown under the list that still fits it:
  // a game that has tipped off since the brief was written moves out of "next".
  const now = (brief.now || []).filter((x) => byId.get(String(x.gameId))?.status !== 'upcoming');
  const next = (brief.next || []).filter((x) => { const g = byId.get(String(x.gameId)); return !g || g.status === 'upcoming'; });
  const tabs = [
    now.length > 0 && { key: 'now', label: 'Live now', count: now.length },
    next.length > 0 && { key: 'next', label: 'Up next', count: next.length },
  ].filter(Boolean);
  const [chosen, setChosen] = useState(null);
  const tab = tabs.some((t) => t.key === chosen) ? chosen : (tabs[0]?.key || 'now');
  const [more, setMore] = useState(false);
  const stamp = updatedText(generatedAt);
  const showNext = tab === 'next' && next.length > 0;
  const list = showNext ? next : now.length > 0 ? now : next;
  const kind = showNext ? 'next' : now.length > 0 ? 'now' : 'next';

  return (
    <div className={h.brief}>
      <div className={h.brHero}>
        <div className={h.brHeroText}>
          <h3 className={h.brHeadline}><TeamText text={brief.headline} size={22} /></h3>
          {brief.dek && <p className={h.brDek}><TeamText text={brief.dek} abbrev size={14} /></p>}
        </div>
        <img className={h.brMascot} src={mascotFor('nba').flat} alt="" width="56" height="56" />
      </div>

      {tabs.length > 0 && (
        <div className={h.brBody}>
          {tabs.length > 1 && (
            <div className={h.brTabs} role="group" aria-label="Brief sections">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`${h.seg} ${tab === t.key ? h.segOn : ''}`} aria-pressed={tab === t.key} onClick={() => setChosen(t.key)}>
                  {t.label} <span className={h.brCount}>{t.count}</span>
                </button>
              ))}
            </div>
          )}
          {tabs.length === 1 && <p className={h.brLabel}>{tabs[0].label}</p>}
          <Items items={list} games={byId} kind={kind} />
        </div>
      )}

      {brief.numbers?.length > 0 && (
        <div className={h.brNumbers}>
          {brief.numbers.map((n) => (
            <div key={`${n.value}-${n.label}`} className={h.brNumber}>
              <b>{n.value}</b>
              <span><TeamText text={n.label} abbrev size={14} /></span>
            </div>
          ))}
        </div>
      )}

      {brief.take && (
        <div className={h.brTake}>
          <span className={h.brTakeLabel}>Maximus says</span>
          <p><TeamText text={brief.take} abbrev size={14} /></p>
        </div>
      )}

      {brief.also && more && <p className={h.brAlso}><TeamText text={brief.also} size={14} /></p>}

      <div className={h.brFoot}>
        <span className={h.small}>{stamp ? `Written ${stamp}` : ''}</span>
        <span className={h.brFootActions}>
          {brief.also && (
            <button type="button" className={h.linkBtn} style={{ marginTop: 0 }} onClick={() => setMore((v) => !v)} aria-expanded={more}>
              {more ? 'Less' : 'Title race'}
            </button>
          )}
          {onRefresh && (
            <button type="button" className={h.iconBtn} style={{ marginLeft: 0 }} onClick={onRefresh} disabled={refreshing} aria-label="Rewrite the brief" title="Rewrite the brief">
              <svg className={refreshing ? h.spin : undefined} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
