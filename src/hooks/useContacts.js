/**
 * useContacts — handles contact permission, phone number hashing,
 * server-side matching, and invite tracking.
 *
 * Privacy: phone numbers are SHA-256 hashed locally before transmission.
 * Raw contact data never leaves the device.
 */

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { track } from '../analytics/index';

async function hashPhone(phone) {
  const normalized = phone.replace(/[^0-9+]/g, '');
  if (normalized.length < 7) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useContacts() {
  const { user, session } = useAuth();
  const [status, setStatus] = useState('idle');
  const [matchedUsers, setMatchedUsers] = useState([]);
  const [unmatchedContacts, setUnmatchedContacts] = useState([]);
  const [error, setError] = useState(null);
  const contactMapRef = useRef(new Map());

  const syncContacts = useCallback(async (rawContacts) => {
    if (!user || !session) {
      setError('Please sign in to sync contacts');
      return;
    }

    setStatus('hashing');
    setError(null);

    try {
      const hashMap = new Map();
      const contactDetailMap = new Map();

      for (const contact of rawContacts) {
        const phones = contact.phoneNumbers || contact.tel || [];
        const phoneList = Array.isArray(phones) ? phones : [phones];
        for (const phone of phoneList) {
          const phoneStr = typeof phone === 'string' ? phone : phone?.value || phone?.number || '';
          if (!phoneStr) continue;
          const hash = await hashPhone(phoneStr);
          if (hash) {
            hashMap.set(hash, phoneStr);
            contactDetailMap.set(hash, {
              name: contact.name || contact.displayName ||
                    [contact.givenName, contact.familyName].filter(Boolean).join(' ') ||
                    'Unknown',
              phoneHash: hash,
            });
          }
        }
      }

      contactMapRef.current = contactDetailMap;
      const phoneHashes = Array.from(hashMap.keys());

      if (phoneHashes.length === 0) {
        setStatus('done');
        setMatchedUsers([]);
        setUnmatchedContacts([]);
        return;
      }

      setStatus('matching');

      const token = session.access_token;
      const res = await fetch('/api/social/contact-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneHashes }),
      });

      if (!res.ok) throw new Error('Failed to match contacts');

      const data = await res.json();
      setMatchedUsers(data.matchedUsers || []);

      const unmatched = (data.unmatchedHashes || [])
        .map(hash => contactDetailMap.get(hash))
        .filter(Boolean);
      setUnmatchedContacts(unmatched);

      setStatus('done');
      track('contacts_synced', {
        total_contacts: rawContacts.length,
        hashed: phoneHashes.length,
        matched: (data.matchedUsers || []).length,
        unmatched: unmatched.length,
      });
    } catch (err) {
      console.error('[useContacts] sync error:', err);
      setError(err.message || 'Failed to sync contacts');
      setStatus('error');
    }
  }, [user, session]);

  const requestAndSync = useCallback(async () => {
    setStatus('requesting');
    setError(null);

    try {
      if (!('contacts' in navigator) && !('ContactsManager' in window)) {
        setError('Contact sync is not supported in this browser. Please use the mobile app.');
        setStatus('error');
        track('contacts_permission', { result: 'unsupported' });
        return;
      }

      const props = ['name', 'tel'];
      const opts = { multiple: true };
      const contacts = await navigator.contacts.select(props, opts);

      track('contacts_permission', { result: 'granted', count: contacts.length });
      await syncContacts(contacts);
    } catch (err) {
      if (err.name === 'TypeError' || err.message?.includes('not supported')) {
        setError('Contact sync requires the mobile app or a supported browser.');
        setStatus('error');
        track('contacts_permission', { result: 'unsupported' });
      } else {
        setError('Contact permission denied or cancelled.');
        setStatus('idle');
        track('contacts_permission', { result: 'denied' });
      }
    }
  }, [syncContacts]);

  const trackInvite = useCallback(async (phoneHash) => {
    if (!session) return;
    try {
      await fetch('/api/social/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phoneHash }),
      });
      track('contact_invite_sent', { phone_hash: phoneHash.slice(0, 8) });
    } catch {
      // non-blocking
    }
  }, [session]);

  return {
    status,
    matchedUsers,
    unmatchedContacts,
    error,
    syncContacts,
    requestAndSync,
    trackInvite,
  };
}
