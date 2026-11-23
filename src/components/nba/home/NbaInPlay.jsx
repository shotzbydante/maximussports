/**
 * NbaInPlay — tonight's picks whose games have tipped off.
 *
 * A pick leaves the board at tip-off. Each row here is one of those picks
 * with the score and where it stands: on track, needs help, won or lost.
 * The standing is worked out from the live score, so it is as current as
 * the games feed.
 */

import { NbaLogo } from './NbaTeamTag';
import { statusText } from './nbaFormat';
import { nbaLiveStatus } from './nbaPickHelpers';
import h from '../../nfl/home/home.module.css';

const VERDICT = {
  won: { label: 'Won', tone: 'chipUp' },
  lost: { label: 'Lost', tone: 'chipDown' },
  push: { label: 'Push', tone: '' },
  ahead: { label: 'On track', tone: 'chipUp' },
  behind: { label: 'Needs help', tone: 'chipWarn' },
  level: { label: 'On the number', tone: '' },
};

function Row({ pick, game }) {
  const live = game.status === 'live';
  const status = nbaLiveStatus(pick, game);
  const v = VERDICT[status.verdict] || null;
  const settled = ['won', 'lost', 'push'].includes(status.verdict);
  const { away, home } = game.teams;
  return (
    <li className={h.ipRow}>
      <div className={h.ipTop}>
        <span className={h.ipPick}>{pick.label}</span>
        {v && <span className={`${h.chip} ${v.tone ? h[v.tone] : ''} ${h.ipVerdict}`}>{v.label}</span>}
      </div>
      <div className={h.ipGame}>
        <span className={h.ipScore}>
          <NbaLogo slug={away.slug} src={away.logo} size={18} />
          <span>{away.abbrev}</span><b>{away.score ?? ''}</b>
          <NbaLogo slug={home.slug} src={home.logo} size={18} />
          <span>{home.abbrev}</span><b>{home.score ?? ''}</b>
        </span>
        {live
          ? <span className={`${h.chip} ${h.chipLive}`}><span className={h.dot} aria-hidden="true" />{statusText(game)}</span>
          : <span className={h.small}>{statusText(game)}</span>}
      </div>
      {status.text && (
        <p className={h.ipText}>
          {status.text}
          {live && settled ? ' Decided, whatever happens from here.' : ''}
        </p>
      )}
    </li>
  );
}

/** `rows` is [{ pick, game }] for picks whose game is live or final. */
export default function NbaInPlay({ rows }) {
  if (!rows || rows.length === 0) return null;
  const live = rows.filter((r) => r.game.status === 'live').length;
  return (
    <div className={`${h.card} ${h.cardFlush}`}>
      <div className={h.ipHead}>
        <span>{live > 0 ? 'In play' : 'Earlier tonight'}</span>
        <span className={h.small}>{live > 0 ? `${live} live` : `${rows.length} final`}</span>
      </div>
      <ul className={h.ipList}>
        {rows.map(({ pick, game }) => <Row key={pick.id} pick={pick} game={game} />)}
      </ul>
    </div>
  );
}
