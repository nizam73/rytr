// state.js — Shared mutable state
// Both chat.js and ui.js import this. Mutate fields directly: S.currentUser = user

export const S = {
  currentUser:       null,
  currentUserData:   null,
  currentChatId:     null,
  currentChatType:   null,
  currentChatMeta:   {},
  isLocked:          false,
  selectedPtsAmt:    0,
  pendingUnlock:     null,
  msgListeners:      {},
  chatListeners:     {},
  unreadCounts:      {},
  unlockDataMap:     new Map(),
  pendingUnlockData: null,
  settingsType:      '',
  writerProfileSource: 'list',
  // Pagination
  paginationFirstDoc: null,   // oldest loaded doc — used for "load more"
  paginationColPath:  null,   // current chat's collection path
  paginationDone:     false,  // true when no more older messages exist
};
