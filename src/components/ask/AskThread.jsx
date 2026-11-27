/**
 * AskThread — the conversation itself: messages, cards, what to ask next,
 * and the box to type in. The launcher's panel and the full page both
 * render this one component over the same state (AskProvider).
 *
 * Every answer has the same anatomy: a line or two from Maximus, then
 * cards the server built from the data, then follow-up chips. Chips and
 * starter questions send ordinary messages, so there is one way in.
 *
 * What changes by visitor is decided on the server. This component only
 * shows it: a guest sees how many free questions are left and, at the
 * limit, one email field; a free account sees the Pro offer at its limit.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePinnedTeams from '../../hooks/usePinnedTeams';
import { mascotFor } from '../../brand/mascots';
import { track } from '../../analytics/index';
import { PLAN_LIMITS } from '../../lib/entitlements';
import { TeamText } from '../nfl/home/NflTeamTag';
import ConfirmEmailBar from '../common/ConfirmEmailBar';
import AskCards, { Chips, UpgradeCard } from './AskCards';
import AskEmailGate from './AskEmailGate';
import { useAskThread } from './askState';
import { pageContext, starters } from './askContext';
import a from './ask.module.css';

const SPORT = 'nfl';

/** Shown while Maximus is working and has not said what on. In character, never "searching". */
const WORKING = ['Reading the board', 'Checking the prices', 'Doing the math'];

const RESPONSIBLE = 'Maximus is an AI. 21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.';

const Message = memo(function Message({ message, now, last, busy, onAsk, onOpen, mascot, userId, guestPass }) {
  if (message.role === 'user') {
    return <li className={a.user} data-ask-turn={message.id}><p>{message.text}</p></li>;
  }
  return (
    <li className={a.bot}>
      <img className={a.face} src={mascot} alt="" width="28" height="28" />
      <div className={a.botBody}>
        {message.text && (
          <p className={a.words}>
            <TeamText text={message.text} size={16} />
          </p>
        )}
        <AskCards cards={message.cards} now={now} last={last} disabled={busy} onAsk={onAsk} onOpen={onOpen} userId={userId} guestPass={guestPass} />
      </div>
    </li>
  );
});

/** What stands where the box would be once today's questions are used. */
function AtTheLimit({ t }) {
  const { usage, tier, guestPass, userId } = t;
  if (tier === 'guest' && !guestPass) {
    return (
      <div className={a.limit} role="status">
        <p><b>That is today’s {usage.cap} free questions.</b> Enter your email for more today, every call on the board, and a conversation that is saved.</p>
        <AskEmailGate placement="ask_cap" cta="Keep asking" />
      </div>
    );
  }
  if (tier === 'guest') {
    return (
      <div className={a.limit} role="status">
        <p><b>That is today’s questions.</b> Confirm your email and you get {PLAN_LIMITS.free.askDailyMessages} a day, saved across your devices.</p>
        <ConfirmEmailBar email={guestPass.email} next="/nfl/ask" />
      </div>
    );
  }
  if (tier === 'free') {
    return (
      <div className={a.limit} role="status">
        <p><b>That is today’s {usage.cap} questions.</b> They reset at midnight Eastern.</p>
        <UpgradeCard card={{ reason: 'shop_prices' }} userId={userId} placement="ask_cap" />
      </div>
    );
  }
  return <p className={a.notice} role="status">You have used today’s {usage.cap} questions. They reset at midnight Eastern.</p>;
}

export default function AskThread({ variant = 'page', autoFocus = false, seed = '' }) {
  const t = useAskThread();
  const { pathname } = useLocation();
  const { pinnedTeams } = usePinnedTeams({ sport: SPORT });
  const mascot = mascotFor(SPORT).flat;
  const { messages, usage, ready, reason, loading, busy, streamed, working, draft, setDraft, notice, ask, clear, want, tier, userId, guestPass, maxChars } = t;

  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { want(); }, [want]);

  // A question carried in the link (/ask?q=...) is put in the box, not sent: the visitor decides.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !seed) return;
    seeded.current = true;
    setDraft(seed.slice(0, maxChars));
  }, [seed, setDraft, maxChars]);

  // Card ages are relative to now; a minute's resolution is plenty.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Rotate the working line until Maximus says what it is doing.
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(timer);
  }, [busy]);

  // A new question is brought to the top of the view and the answer grows
  // beneath it, so the first line of the answer is what the reader sees.
  // Nothing scrolls while the words arrive: the reader keeps their place.
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;
  const placed = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const turn = lastUserId != null ? el?.querySelector(`[data-ask-turn="${lastUserId}"]`) : null;
    const spacer = endRef.current;
    if (!el || !spacer) return;
    if (variant !== 'panel') {
      if (turn && placed.current !== lastUserId) {
        if (placed.current !== null || busy) turn.scrollIntoView({ block: 'start' });
        placed.current = lastUserId;
      }
      return;
    }
    // Room under a short answer, so the question can still reach the top.
    // Measured from where the content ends (the spacer's own top), never by
    // collapsing the spacer first: collapsing it lets the browser pull the
    // view back down to the bottom, which hid the answer under the question.
    if (turn) {
      const content = spacer.offsetTop - turn.offsetTop;
      spacer.style.height = `${Math.max(0, el.clientHeight - content - 20)}px`;
    } else {
      spacer.style.height = '0px';
    }
    if (turn && placed.current !== lastUserId) {
      placed.current = lastUserId;
      el.scrollTop = turn.offsetTop - 10;
    }
  }, [lastUserId, messages.length, streamed, working, busy, variant]);

  // The box grows with what is typed, up to a few lines. (CSS field-sizing is not in Safari.)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  useEffect(() => { if (autoFocus && !loading) inputRef.current?.focus(); }, [autoFocus, loading]);

  const send = useCallback((text, source) => { ask(text, source); }, [ask]);
  const onSubmit = (e) => { e.preventDefault(); send(draft, 'typed'); };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft, 'typed'); }
  };
  const onOpen = useCallback((card) => track('ask_card_opened', { sport: SPORT, card_type: card.type, game_id: card.gameId }), []);
  const onClear = async () => { setConfirmClear(false); await clear(); };

  const ctx = useMemo(() => pageContext(pathname), [pathname]);
  const prompts = useMemo(
    () => starters(ctx, { followed: pinnedTeams?.[0], shopPrices: !!usage?.shopPrices }),
    [ctx, pinnedTeams, usage?.shopPrices],
  );
  const capped = !!usage && usage.left === 0;
  const off = !ready;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const workingLine = working || WORKING[tick % WORKING.length];
  const over = draft.length > maxChars;
  const empty = messages.length === 0 && !loading && !busy;

  return (
    <section className={`${a.chat} ${variant === 'panel' ? a.inPanel : a.inPage}`} aria-label="Ask Maximus">
      <div className={a.scroll} ref={scrollRef}>
        {messages.length > 0 && (
          <div className={a.bar}>
            {confirmClear ? (
              <span className={a.confirm}>
                Clear this conversation?
                <button type="button" onClick={onClear}>Clear</button>
                <button type="button" onClick={() => setConfirmClear(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className={a.clear} onClick={() => setConfirmClear(true)} disabled={busy}>Clear conversation</button>
            )}
          </div>
        )}

        {empty && (
          <div className={a.empty}>
            {variant === 'page' && <img className={a.hero} src={mascot} alt="" width="72" height="72" />}
            <h2 className={a.hello}>I’m Maximus. I’ve done the math on this week.</h2>
            <p className={a.sub}>
              Ask about a pick, a price or a matchup. I’ll give you my call and the reason, and say how strong it is.
              {tier === 'guest' && usage?.left > 0 && ` Your first ${usage.cap} questions need no account.`}
            </p>
            {!off && !capped && <Chips items={prompts} onAsk={send} disabled={busy} source="starter" />}
          </div>
        )}

        <ol className={a.thread}>
          {messages.map((m) => (
            <Message
              key={m.id}
              message={m}
              now={now}
              mascot={mascot}
              last={m.id === lastAssistantId && !busy}
              busy={busy || off || capped}
              onAsk={send}
              onOpen={onOpen}
              userId={userId}
              guestPass={guestPass}
            />
          ))}
          {busy && (
            <li className={a.bot}>
              <img className={`${a.face} ${a.faceBusy}`} src={mascot} alt="" width="28" height="28" />
              <div className={a.botBody}>
                {streamed
                  ? <p className={a.words}><TeamText text={streamed} size={16} /></p>
                  : <p className={a.working}>{workingLine}<span className={a.dots} aria-hidden="true" /></p>}
              </div>
            </li>
          )}
        </ol>
        <div ref={endRef} aria-hidden="true" />
      </div>

      {/* Screen readers hear what Maximus is doing and then the finished answer, not every streamed word. */}
      <p className={a.srOnly} aria-live="polite">
        {busy ? `${workingLine}.` : (messages.at(-1)?.role === 'assistant' ? messages.at(-1).text : '')}
      </p>

      <div className={a.dock}>
        {notice && <p className={a.notice} role="alert">{notice.message}</p>}
        {off && !loading && (
          <p className={a.notice} role="status">
            {reason === 'unreachable'
              ? 'Could not reach Maximus. Check your connection and reload.'
              : 'Ask Maximus is not switched on yet.'}
          </p>
        )}
        {capped && !off ? <AtTheLimit t={t} /> : (
          <form className={a.composer} onSubmit={onSubmit}>
            <label className={a.srOnly} htmlFor={`ask-input-${variant}`}>Ask Maximus</label>
            <textarea
              id={`ask-input-${variant}`}
              ref={inputRef}
              className={a.input}
              rows={1}
              value={draft}
              placeholder="Ask about a pick, a price or a matchup"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={off || loading}
              enterKeyHint="send"
            />
            <button type="submit" className={a.send} disabled={busy || off || loading || !draft.trim() || over} aria-label="Send">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 16V4M10 4 5 9M10 4l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        )}
        <p className={a.fine}>
          {over && <span className={a.overText}>{draft.length - maxChars} characters over. </span>}
          {usage && usage.left > 0 && (tier !== 'pro' || usage.left <= 10) && (
            <span>{usage.left} of {usage.cap} {tier === 'guest' ? 'free ' : ''}questions left today. </span>
          )}
          {RESPONSIBLE}
        </p>
      </div>
    </section>
  );
}
