/**
 * HomeInPlay — this week's picks whose games have kicked off.
 *
 * A pick leaves the board at kickoff, which used to make it vanish from the
 * page exactly when people want to see it. Each row here is one of those
 * picks with the score and where it stands: on track, behind, won or lost.
 */

import NflLogo from '../NflLogo';
import { fmtOdds } from './format';
import h from './home.module.css';

const VERDICT = {
  won: { label: 'Won', tone: 'chipUp' },
  lost: { label: 'Lost', tone: 'chipDown' },
  push: { label: 'Push', tone: '' },
  ahead: { label: 'On track', tone: 'chipUp' },
  behind: { label: 'Needs help', tone: 'chipWarn' },
  level: { label: 'On the number', tone: '' },
};

function Row({ pick }) {
  const live = pick.gameStatus === 'live';
  const v = VERDICT[pick.status?.verdict] || null;
  const settled = ['won', 'lost', 'push'].includes(pick.status?.verdict);
  const price = [pick.market !== 'moneyline' ? fmtOdds(pick.price) : '', pick.book ? `at ${pick.book}` : ''].filter(Boolean).join(' ');
  return (
    <li className={h.ipRow}>
      <div className={h.ipTop}>
        <span className={h.ipPick}>{pick.label}</span>
        {price && <span className={h.small}>{price}</span>}
        {v && <span className={`${h.chip} ${v.tone ? h[v.tone] : ''} ${h.ipVerdict}`}>{v.label}</span>}
      </div>
      <div className={h.ipGame}>
        <span className={h.ipScore}>
          <NflLogo slug={pick.away.slug} size={18} />
          <span>{pick.away.abbrev}</span><b>{pick.away.score ?? ''}</b>
          <NflLogo slug={pick.home.slug} size={18} />
          <span>{pick.home.abbrev}</span><b>{pick.home.score ?? ''}</b>
        </span>
        {live
          ? <span className={`${h.chip} ${h.chipLive}`}><span className={h.dot} aria-hidden="true" />{pick.clock || 'Live'}</span>
          : <span className={h.small}>Final</span>}
      </div>
      {pick.status?.text && (
        <p className={h.ipText}>
          {pick.status.text}
          {live && settled ? ' Decided, whatever happens from here.' : ''}
        </p>
      )}
    </li>
  );
}

export default function HomeInPlay({ picks }) {
  if (!picks || picks.length === 0) return null;
  const live = picks.filter((p) => p.gameStatus === 'live').length;
  return (
    <div className={`${h.card} ${h.cardFlush}`}>
      <div className={h.ipHead}>
        <span>{live > 0 ? 'In play' : 'Earlier this week'}</span>
        <span className={h.small}>{live > 0 ? `${live} live` : `${picks.length} final`}</span>
      </div>
      <ul className={h.ipList}>
        {picks.map((p) => <Row key={p.id} pick={p} />)}
      </ul>
    </div>
  );
}
