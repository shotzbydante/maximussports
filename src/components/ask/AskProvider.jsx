/**
 * AskProvider — Ask Maximus's state for the whole app.
 *
 * There is one conversation, and two places to have it: the launcher's
 * panel on any page and the full page at /nfl/ask. Both read the thread
 * from here, so opening one after the other continues the same exchange
 * and nothing is fetched twice.
 *
 * State is read through two contexts (askState.js), so a page button that
 * only needs openAsk() does not re-render on every streamed word.
 *
 * An account's thread lives on the server. A signed-out visitor's lives in
 * this tab (sessionStorage) and is sent back with each question.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useGuestPass from '../../hooks/useGuestPass';
import { track } from '../../analytics/index';
import { fetchStatus, fetchThread, sendMessage, clearThread } from './askClient';
import { pageContext } from './askContext';
import { AskUiCtx, AskThreadCtx } from './askState';

const SPORT = 'nfl';
const MAX_CHARS = 600;
const GUEST_THREAD_KEY = 'mx_ask_guest_thread';
const GUEST_HISTORY = 6;

function readGuestThread() {
  try { const v = JSON.parse(window.sessionStorage.getItem(GUEST_THREAD_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeGuestThread(messages) {
  try { window.sessionStorage.setItem(GUEST_THREAD_KEY, JSON.stringify(messages.slice(-30))); } catch { /* storage blocked: the thread lasts until reload */ }
}

export function AskProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;

  // Does chat exist for this visitor, and what is the week like?
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (authLoading) return undefined;
    let alive = true;
    fetchStatus({ signedIn: !!userId }).then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, [authLoading, userId]);

  // Keyed by visitor: signing in or out starts the thread from a clean slate.
  return (
    <AskState key={userId || 'guest'} userId={userId} authLoading={authLoading} status={status}>
      {children}
    </AskState>
  );
}

function AskState({ userId, authLoading, status, children }) {
  const { pathname } = useLocation();
  const pass = useGuestPass();
  const enabled = !!status?.enabled;
  const onFullPage = pathname === '/ask' || pathname === '/nfl/ask';

  // The panel.
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The ideas page (what Maximus can do) is opened from the panel's header and shown by the thread.
  const [ideasOpen, setIdeasOpen] = useState(false);

  // The thread.
  const [messages, setMessages] = useState([]);
  const [usage, setUsage] = useState(null);
  const [ready, setReady] = useState(true);
  const [reason, setReason] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [wanted, setWanted] = useState(false); // someone has opened chat: time to load
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [working, setWorking] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState(null);

  const lastIdRef = useRef(0);
  const busyRef = useRef(false);
  const messagesRef = useRef(messages);
  const pathRef = useRef(pathname);
  const [queued, setQueued] = useState(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  const applyThread = useCallback((data, { append }) => {
    if (data.usage) setUsage(data.usage);
    setReady(data.ready !== false);
    setReason(data.reason || null);
    const incoming = data.messages || [];
    const ids = incoming.map((m) => m.id).filter((id) => typeof id === 'number');
    if (ids.length) lastIdRef.current = Math.max(lastIdRef.current, ...ids);
    setMessages((prev) => {
      if (!append) return incoming;
      const have = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !have.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  useEffect(() => {
    if (!wanted || loaded || authLoading || !enabled) return undefined;
    let alive = true;
    fetchThread()
      .then((data) => {
        if (!alive) return;
        // A guest's messages are their own tab's; the server only knows the count.
        applyThread(userId ? data : { ...data, messages: readGuestThread() }, { append: false });
      })
      .catch(() => { if (alive) { setReady(false); setReason('unreachable'); } })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [wanted, loaded, authLoading, enabled, userId, applyThread]);

  // A guest who has just left an email has a higher cap: read usage again.
  useEffect(() => {
    if (userId || !loaded || !pass) return;
    fetchThread().then((data) => { if (data.usage) setUsage(data.usage); }).catch(() => {});
  }, [pass, userId, loaded]);

  // Coming back to the tab picks up anything an account sent from another device.
  useEffect(() => {
    if (!userId || !loaded) return undefined;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      fetchThread(lastIdRef.current).then((data) => applyThread(data, { append: true })).catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [userId, loaded, applyThread]);

  const ask = useCallback(async (raw, source = 'typed') => {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text || busyRef.current || text.length > MAX_CHARS) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setStreamed('');
    setWorking('');
    setDraft('');
    const tempId = `temp-${Date.now()}`;
    const mine = { id: tempId, role: 'user', text, cards: [] };
    const before = messagesRef.current;
    setMessages((prev) => [...prev, mine]);
    const started = Date.now();
    const page = pageContext(pathRef.current);
    track('ask_message_sent', { sport: SPORT, source, length: text.length, page: page.kind, signed_in: !!userId });

    const result = await sendMessage(text, {
      page: { kind: page.kind, teams: page.teams },
      history: userId ? null : before.slice(-GUEST_HISTORY).map((m) => ({ role: m.role, text: m.text })),
      onEvent: (event) => {
        if (event.type === 'status') setWorking(event.label);
        else if (event.type === 'text') setStreamed((s) => s + event.delta);
        else if (event.type === 'reset') setStreamed('');
      },
    });

    if (result.usage) setUsage(result.usage);
    if (result.type === 'done') {
      if (typeof result.message.id === 'number') lastIdRef.current = Math.max(lastIdRef.current, result.message.id);
      const next = [...before, { ...mine, id: result.userMessageId ?? tempId }, result.message];
      setMessages(next);
      if (!userId) writeGuestThread(next);
      const cards = result.message.cards || [];
      track('ask_answer_shown', {
        sport: SPORT, source, page: page.kind, plan: result.usage?.tier,
        cards: cards.filter((c) => c.type !== 'chips').length,
        locked: cards.some((c) => c.type === 'locked'),
        pro_offer: cards.some((c) => c.type === 'upgrade'),
        duration_ms: Date.now() - started,
      });
    } else {
      // The question was not stored: hand the words back so nothing is lost.
      setMessages(before);
      if (result.code !== 'capped') setDraft(text);
      setNotice(result.code === 'capped' ? null : { code: result.code, message: result.message });
      track('ask_error', { sport: SPORT, code: result.code, page: page.kind });
    }
    setStreamed('');
    setWorking('');
    busyRef.current = false;
    setBusy(false);
  }, [userId]);

  // A question asked from a page button waits for the thread to load, then sends.
  useEffect(() => {
    if (!queued || !loaded || busy || !ready) return undefined;
    const t = setTimeout(() => { setQueued(null); ask(queued.question, queued.source); }, 0);
    return () => clearTimeout(t);
  }, [queued, loaded, busy, ready, ask]);

  const clear = useCallback(async () => {
    if (await clearThread()) {
      setMessages([]);
      lastIdRef.current = 0;
      if (!userId) writeGuestThread([]);
      track('ask_cleared', { sport: SPORT });
    }
  }, [userId]);

  /** Mount the thread (the full page calls this; the panel calls it on open). */
  const want = useCallback(() => setWanted(true), []);

  /**
   * Open the panel. With a question, send it: a tap on "Ask why" should
   * produce an answer, not an empty box.
   */
  const openAsk = useCallback(({ question = null, source = 'launcher' } = {}) => {
    setWanted(true);
    setOpen(true);
    track('ask_opened', { sport: SPORT, source, page: pageContext(pathRef.current).kind, with_question: !!question });
    if (question) setQueued({ question, source });
  }, []);
  const close = useCallback(() => { setOpen(false); setExpanded(false); setIdeasOpen(false); }, []);

  // On the full page the panel is shut: the same thread is the page itself.
  const ui = useMemo(
    () => ({ enabled, status, open: open && !onFullPage, expanded, openAsk, close, setExpanded, ideasOpen, setIdeasOpen }),
    [enabled, status, open, onFullPage, expanded, openAsk, close, ideasOpen],
  );
  const thread = useMemo(() => ({
    messages, usage, ready, reason, loading: wanted && !loaded, busy, streamed, working, draft, setDraft, notice,
    ask, clear, want, signedIn: !!userId, userId, guestPass: pass, tier: usage?.tier || (userId ? 'free' : 'guest'), maxChars: MAX_CHARS,
  }), [messages, usage, ready, reason, wanted, loaded, busy, streamed, working, draft, notice, ask, clear, want, userId, pass]);

  return (
    <AskUiCtx.Provider value={ui}>
      <AskThreadCtx.Provider value={thread}>{children}</AskThreadCtx.Provider>
    </AskUiCtx.Provider>
  );
}
