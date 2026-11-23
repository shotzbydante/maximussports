/**
 * AskMaximus — the chat. One conversation per account, stored on the
 * server (api/ask/chat.js); this component is only its web face.
 *
 * Every answer has the same anatomy: a line or two from Maximus, then
 * cards the server built from the data, then follow-up chips. Chips and
 * starter prompts send ordinary messages, so there is one way in.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import usePinnedTeams from '../../hooks/usePinnedTeams';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import { mascotFor } from '../../brand/mascots';
import { track } from '../../analytics/index';
import { PLAN_LIMITS } from '../../lib/entitlements';
import { TeamText } from '../nfl/home/NflTeamTag';
import AskCards, { Chips } from './AskCards';
import { fetchThread, sendMessage, clearThread } from './askClient';
import a from './ask.module.css';

const MAX_CHARS = 600;
const SPORT = 'nfl';

/** Shown while Maximus is working and has not said what on. In character, never "searching". */
const WORKING = ['Reading the board', 'Checking the prices', 'Doing the math'];

const RESPONSIBLE = 'Maximus is an AI. 21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.';

function starters(teamSlug) {
  const team = getNflTeamBySlug(teamSlug);
  return [
    'What are your best bets this week?',
    team ? `Break down the ${team.nickname} game` : 'Which game has the biggest mismatch?',
    'How are this week’s picks doing?',
    'What is your record this season?',
  ];
}

const Message = memo(function Message({ message, now, last, busy, onAsk, onOpen, onUpgrade, mascot }) {
  if (message.role === 'user') {
    return <li className={a.user}><p>{message.text}</p></li>;
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
        <AskCards cards={message.cards} now={now} last={last} disabled={busy} onAsk={onAsk} onOpen={onOpen} onUpgrade={onUpgrade} />
      </div>
    </li>
  );
});

export default function AskMaximus() {
  const { user } = useAuth();
  const { pinnedTeams } = usePinnedTeams({ sport: SPORT });
  const mascot = mascotFor(SPORT).flat;

  const [messages, setMessages] = useState([]);
  const [usage, setUsage] = useState(null);
  const [ready, setReady] = useState(true);
  const [reason, setReason] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const lastIdRef = useRef(0);
  const busyRef = useRef(false);

  // Card ages are relative to now; a minute's resolution is plenty.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const applyThread = useCallback((data, { append }) => {
    if (data.usage) setUsage(data.usage);
    setReady(data.ready !== false);
    setReason(data.reason || null);
    const incoming = data.messages || [];
    if (incoming.length) lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
    setMessages((prev) => {
      if (!append) return incoming;
      const have = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !have.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    track('ask_opened', { sport: SPORT });
    fetchThread()
      .then((data) => { if (alive) applyThread(data, { append: false }); })
      .catch(() => { if (alive) { setReady(false); setReason('unreachable'); } })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [user, applyThread]);

  // Coming back to the tab picks up anything sent from another device.
  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      fetchThread(lastIdRef.current).then((data) => applyThread(data, { append: true })).catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user, applyThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
  }, [messages.length, streamed, status, busy]);

  // Rotate the working line until Maximus says what it is doing.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [busy]);

  const ask = useCallback(async (raw, source = 'typed') => {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text || busyRef.current || text.length > MAX_CHARS) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setStreamed('');
    setStatus('');
    setDraft('');
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: 'user', text, cards: [] }]);
    const started = Date.now();
    track('ask_message_sent', { sport: SPORT, source, length: text.length });

    const result = await sendMessage(text, (event) => {
      if (event.type === 'status') setStatus(event.label);
      else if (event.type === 'text') setStreamed((s) => s + event.delta);
      else if (event.type === 'reset') setStreamed('');
    });

    if (result.usage) setUsage(result.usage);
    if (result.type === 'done') {
      lastIdRef.current = Math.max(lastIdRef.current, result.message.id);
      setMessages((prev) => [
        ...prev.map((m) => (m.id === tempId ? { ...m, id: result.userMessageId } : m)),
        result.message,
      ]);
      track('ask_answer_shown', {
        sport: SPORT, source,
        cards: result.message.cards.filter((c) => c.type !== 'chips').length,
        locked: result.message.cards.some((c) => c.type === 'locked'),
        duration_ms: Date.now() - started,
      });
    } else {
      // The question was not stored: hand the words back so nothing is lost.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      setNotice({ code: result.code, message: result.message });
      track('ask_error', { sport: SPORT, code: result.code });
    }
    setStreamed('');
    setStatus('');
    busyRef.current = false;
    setBusy(false);
    inputRef.current?.focus();
  }, []);

  const onSubmit = (e) => { e.preventDefault(); ask(draft, 'typed'); };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft, 'typed'); }
  };

  const onOpen = useCallback((card) => track('ask_card_opened', { sport: SPORT, card_type: card.type, game_id: card.gameId }), []);
  const onUpgrade = useCallback(() => track('ask_upgrade_clicked', { sport: SPORT, surface: 'locked_card' }), []);

  const onClear = async () => {
    setConfirmClear(false);
    if (await clearThread()) {
      setMessages([]);
      lastIdRef.current = 0;
      track('ask_cleared', { sport: SPORT });
    }
  };

  const prompts = useMemo(() => starters(pinnedTeams?.[0]), [pinnedTeams]);
  const loading = !!user && !loaded;
  const capped = usage && usage.left === 0;
  const off = !ready;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const working = status || WORKING[tick % WORKING.length];
  const over = draft.length > MAX_CHARS;

  if (!user) {
    return (
      <section className={a.chat} aria-label="Ask Maximus">
        <div className={a.empty}>
          <img className={a.hero} src={mascot} alt="" width="72" height="72" />
          <h2 className={a.hello}>Ask about any pick, line or matchup</h2>
          <p className={a.sub}>Maximus answers from this week’s board, with the price, the book and the reason for every pick.</p>
          <Link to="/settings?next=%2Fnfl%2Fask" className={a.signIn}>Create a free account</Link>
        </div>
      </section>
    );
  }

  return (
    <section className={a.chat} aria-label="Ask Maximus">
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

      {messages.length === 0 && !loading && (
        <div className={a.empty}>
          <img className={a.hero} src={mascot} alt="" width="72" height="72" />
          <h2 className={a.hello}>I’m Maximus. I’ve done the math on this week.</h2>
          <p className={a.sub}>Ask about a pick, a line or a matchup. Most games are a pass, and I’ll say so.</p>
          {!off && !capped && <Chips items={prompts} onAsk={ask} disabled={busy} source="starter" />}
        </div>
      )}

      <ol className={a.thread} aria-live="polite">
        {messages.map((m) => (
          <Message
            key={m.id}
            message={m}
            now={now}
            mascot={mascot}
            last={m.id === lastAssistantId && !busy}
            busy={busy || off || capped}
            onAsk={ask}
            onOpen={onOpen}
            onUpgrade={onUpgrade}
          />
        ))}
        {busy && (
          <li className={a.bot}>
            <img className={`${a.face} ${a.faceBusy}`} src={mascot} alt="" width="28" height="28" />
            <div className={a.botBody}>
              {streamed
                ? <p className={a.words}><TeamText text={streamed} size={16} /></p>
                : <p className={a.working}>{working}<span className={a.dots} aria-hidden="true" /></p>}
            </div>
          </li>
        )}
      </ol>
      <div ref={endRef} />

      {notice && <p className={a.notice} role="alert">{notice.message}</p>}
      {off && !loading && (
        <p className={a.notice} role="status">
          {reason === 'paused'
            ? 'Ask Maximus is taking a short break. The picks are on the NFL page.'
            : reason === 'unreachable'
              ? 'Could not reach Maximus. Check your connection and reload.'
              : 'Ask Maximus is not switched on yet.'}
        </p>
      )}
      {capped && !off && (
        <p className={a.notice} role="status">
          You have used today’s {usage.cap} questions. They reset at midnight Eastern.
          {usage.tier === 'free' && (
            <> <Link to="/settings?openBilling=1" onClick={() => track('ask_upgrade_clicked', { sport: SPORT, surface: 'cap' })}>Pro gets {PLAN_LIMITS.pro.askDailyMessages} a day</Link>.</>
          )}
        </p>
      )}

      <form className={a.composer} onSubmit={onSubmit}>
        <label className={a.srOnly} htmlFor="ask-input">Ask Maximus</label>
        <textarea
          id="ask-input"
          ref={inputRef}
          className={a.input}
          rows={1}
          value={draft}
          placeholder={capped ? 'Back tomorrow' : 'Ask about a pick, a line or a matchup'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={off || capped || loading}
          enterKeyHint="send"
        />
        <button type="submit" className={a.send} disabled={busy || off || capped || loading || !draft.trim() || over} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 16V4M10 4 5 9M10 4l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      <p className={a.fine}>
        {over && <span className={a.overText}>{draft.length - MAX_CHARS} characters over. </span>}
        {usage && usage.left != null && usage.left > 0 && (usage.tier === 'free' || usage.left <= 10) && (
          <span>{usage.left} of {usage.cap} questions left today. </span>
        )}
        {RESPONSIBLE}
      </p>
    </section>
  );
}
