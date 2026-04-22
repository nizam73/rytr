// state.js — Shared mutable state
// Both chat.js and ui.js import this. Mutate fields directly: S.currentUser = user

export const S = {
  currentUser:     null,
  currentUserData: null,
  currentChatId:   null,
  currentChatType: null,
  currentChatMeta: {},
  isLocked:        false,
  selectedPtsAmt:  0,
  pendingUnlock:   null,
  msgListeners:    {},
  chatListeners:   {},
  unreadCounts:    {},
  unlockDataMap:   new Map(),
  pendingUnlockData: null,
  settingsType:    '',
  writerProfileSource: 'list',
};
