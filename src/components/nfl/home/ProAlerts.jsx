/**
 * ProAlerts — the Pro offer on the NFL picks page, for a signed-in free
 * account: an email the moment a pick is locked.
 *
 * The case for it is the line. A pick is locked at one book's number, and
 * the market often moves off it within hours. When a pick on the board has
 * moved since it was locked, the card says so with that pick's own numbers.
 * Pro accounts see one line confirming alerts are on.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { startProCheckout, PRO_PRICE_TEXT } from '../../../features/account/upgrade';
import { movedSinceLock } from './pickHelpers';
import h from './home.module.css';

function lockDay(iso) {
  try { return new Date(iso).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

export default function ProAlerts({ isPro, userId, recommended, byGame }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isPro) {
    return (
      <p className={h.sectionNote}>
        <b>Pick alerts are on.</b> You get an email the moment a pick is locked. <Link to="/settings">Change in Settings</Link>
      </p>
    );
  }

  const moved = movedSinceLock(recommended, byGame);
  async function upgrade() {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await startProCheckout({ placement: 'nfl_picks_alerts', userId });
    if (!result.ok) { setBusy(false); setError(result.message); }
  }

  return (
    <aside className={h.proCard} aria-label="Pick alerts with Pro">
      <div className={h.proText}>
        <b className={h.proTitle}>Get the next pick the minute it locks</b>
        <p className={h.proBody}>
          {moved
            ? `${moved.label} was locked ${lockDay(moved.when)} at ${moved.taken}. The market is ${moved.now} now. `
            : 'A pick is locked at one book’s line and price, and lines move. '}
          Pro emails you each pick as it is locked, with the price and the book.
        </p>
        {error && <p className={h.proError} role="alert">{error}</p>}
      </div>
      <button type="button" className={h.proBtn} onClick={upgrade} disabled={busy}>
        {busy ? 'Opening checkout…' : `Get pick alerts, ${PRO_PRICE_TEXT}`}
      </button>
    </aside>
  );
}
