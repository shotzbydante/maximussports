/**
 * AskPanel — the conversation, opened from the launcher.
 *
 * On a phone it is a sheet that rises to about two thirds of the screen
 * and leaves the page visible and scrollable above it. Dragging the handle
 * up, or tapping the box to type, takes it full height; dragging down
 * steps back, then closes. On a wider screen it is a panel docked in the
 * corner, with the full page one click away.
 *
 * It is not a modal: the page behind stays usable. Escape closes it, and
 * focus returns to the launcher.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mascotFor } from '../../brand/mascots';
import { useAsk } from './askState';
import AskThread from './AskThread';
import a from './ask.module.css';
import { track } from '../../analytics/index';

const PHONE = '(max-width: 719px)';
const DRAG_STEP_PX = 70;

function usePhone() {
  const [phone, setPhone] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE);
    const on = (e) => setPhone(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function AskPanel() {
  const { close, expanded, setExpanded, ideasOpen, setIdeasOpen } = useAsk();
  const phone = usePhone();
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const drag = useRef(null);
  const [pull, setPull] = useState(0);
  const full = phone && expanded;

  // Focus lands on the panel's name, so a screen reader says where it is.
  // On a phone the box is not focused: that would raise the keyboard uninvited.
  useEffect(() => { if (phone) titleRef.current?.focus(); }, [phone]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Full height on a phone covers the page, so the page stops scrolling under it.
  useEffect(() => {
    if (!full) return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = before; };
  }, [full]);

  // iOS does not shrink the page for the keyboard. Size the full-height
  // sheet to what is actually visible, so the box stays above the keys.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = panelRef.current;
    if (!full || !vv || !el) return undefined;
    const fit = () => {
      el.style.setProperty('--ask-vh', `${Math.round(vv.height)}px`);
      el.style.setProperty('--ask-top', `${Math.round(vv.offsetTop)}px`);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      el.style.removeProperty('--ask-vh');
      el.style.removeProperty('--ask-top');
    };
  }, [full]);

  // Typing on a phone needs the room.
  const onFocus = useCallback((e) => {
    if (phone && e.target.tagName === 'TEXTAREA') setExpanded(true);
  }, [phone, setExpanded]);

  // Drag the header: up for full height, down to step back or close.
  const onPointerDown = (e) => {
    if (!phone || e.target.closest('button, a')) return;
    drag.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPull(Math.max(0, e.clientY - drag.current.y));
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    drag.current = null;
    setPull(0);
    if (dy > DRAG_STEP_PX) { if (expanded) setExpanded(false); else close(); }
    else if (dy < -DRAG_STEP_PX) setExpanded(true);
  };

  return (
    <div
      ref={panelRef}
      className={`${a.panel} ${full ? a.panelFull : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="ask-panel-title"
      onFocus={onFocus}
      style={pull ? { transform: `translateY(${pull}px)`, transition: 'none' } : undefined}
    >
      <header
        className={a.panelHead}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className={a.grabber} aria-hidden="true" />
        <img src={mascotFor('nfl').flat} alt="" width="32" height="32" />
        <p className={a.panelName}>
          <b id="ask-panel-title" ref={titleRef} tabIndex={-1}>Maximus</b>
          <span>NFL picks, prices and matchups</span>
        </p>
        <button
          type="button"
          className={`${a.ideasPill} ${ideasOpen ? a.ideasPillOn : ''}`}
          aria-pressed={ideasOpen}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (!ideasOpen) track('ask_ideas_opened', { sport: 'nfl', from: 'header' });
            setIdeasOpen(!ideasOpen);
          }}
        >
          <span aria-hidden="true">💡</span> {ideasOpen ? 'Chat' : 'Ideas'}
        </button>
        {phone ? (
          <button type="button" className={a.panelBtn} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Make smaller' : 'Make full screen'}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {expanded
                ? <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M3 10l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
          </button>
        ) : (
          <Link to="/nfl/ask" className={a.panelBtn} aria-label="Open the full page" title="Open the full page">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
        <button type="button" className={a.panelBtn} onClick={close} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </button>
      </header>
      <AskThread variant="panel" autoFocus={!phone} />
    </div>
  );
}
