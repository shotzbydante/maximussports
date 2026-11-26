import { useSyncExternalStore } from 'react';
import { subscribeGuestPass, guestPassSnapshot } from '../features/account/guestPass';

/** The signed-out reader's guest pass ({ email, at }) or null. Re-renders when it is granted or cleared. */
export default function useGuestPass() {
  return useSyncExternalStore(subscribeGuestPass, guestPassSnapshot, () => null);
}
