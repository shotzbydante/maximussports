/**
 * The two contexts Ask Maximus is read through. Kept apart from the
 * provider component so pages can import the hooks without the provider.
 *
 *   useAsk()        whether chat exists, open/closed, openAsk(). Changes rarely.
 *   useAskThread()  the messages and the turn in flight. Changes on every streamed word.
 */

import { createContext, useContext } from 'react';

export const AskUiCtx = createContext({
  enabled: false, status: null, open: false, expanded: false,
  openAsk() {}, close() {}, setExpanded() {},
});
export const AskThreadCtx = createContext(null);

export const useAsk = () => useContext(AskUiCtx);
export const useAskThread = () => useContext(AskThreadCtx);
