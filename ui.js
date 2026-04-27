// ui.js — Navigation, tab switching, mobile slide panel, DOM helpers
// Imports openChat and other logic from chat.js as needed

import { S }                                          from "./state.js";
import { loadWriters, loadRoomsBrowse,
         openWriterProfile, openChat,
         updateInviteBtn }                            from "./chat.js";

// ── HELPERS ──
export function formatTime(d) {
  if(!d) return '';
  return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
}
export function esc(s='') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}
window.toast = toast;

// ── NAVIGATION STATE MACHINE ──
export function isMobile() { return window.innerWidth <= 768; }

export const navStack = [];

export function pushNav(state) {
  navStack.push(state);
  if(isMobile()) history.pushState({ depth: navStack.length }, '');
}

export function showSidebar() {
  document.getElementById('sidebar').classList.remove('slide-out');
  document.getElementById('main').classList.remove('slide-in');
}

export function showMain() {
  if(!isMobile()) return;
  document.getElementById('sidebar').classList.add('slide-out');
  document.getElementById('main').classList.add('slide-in');
}

export function setMainState(state) {
  const emptyEl   = document.getElementById('empty-state');
  const headerEl  = document.getElementById('chat-header');
  const msgsEl    = document.getElementById('messages-wrap');
  const composeEl = document.getElementById('compose');
  const profileEl = document.getElementById('writer-profile');
  const roomProfEl= document.getElementById('room-profile');
  emptyEl.style.display   = 'none';
  headerEl.classList.remove('visible');
  msgsEl.classList.remove('visible');
  composeEl.style.display = 'none';
  profileEl.classList.remove('visible');
  roomProfEl.classList.remove('visible');
  if(state === 'empty')        { emptyEl.style.display = ''; }
  else if(state === 'chat')    { headerEl.classList.add('visible'); msgsEl.classList.add('visible'); composeEl.style.display='flex'; }
  else if(state === 'profile') { profileEl.classList.add('visible'); }
  else if(state === 'room-profile') { roomProfEl.classList.add('visible'); }
}

// ── TAB SWITCH ──
window.switchTab = function(tab, el) {
  document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('chats-panel').style.display   = tab==='chats'   ? 'flex' : 'none';
  document.getElementById('writers-panel').style.display = tab==='writers' ? 'flex' : 'none';
  document.getElementById('rooms-panel').style.display   = tab==='rooms'   ? 'flex' : 'none';
  if(isMobile()) { showSidebar(); navStack.length = 0; }
  S.currentChatId = null;
  setMainState('empty');
  if(tab==='writers') loadWriters();
  if(tab==='rooms')   loadRoomsBrowse();
};

// ── REVEAL CHAT (called by openChat in chat.js) ──
export function revealChat(chatId, type, meta) {
  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
  document.getElementById('ci-'+chatId)?.classList.add('active');
  const headerAvi = document.getElementById('header-avatar');
  headerAvi.style.position = 'relative';
  headerAvi.innerHTML = `<span id="header-initial">${(meta.name[0]||'?').toUpperCase()}</span>`;
  document.getElementById('header-name').textContent = meta.name;
  document.getElementById('header-sub').textContent  = meta.sub || (type==='room'?'Group Room':'Direct Message');
  updateInviteBtn(chatId, type);
  // Clear unread badge
  S.unreadCounts[chatId] = 0;
  const item = document.getElementById('ci-'+chatId);
  item?.querySelector('.chat-badge')?.remove();
  setMainState('chat');
  showMain();
  pushNav({ type:'chat', chatId, chatType:type, chatMeta:meta });
}

// ── WRITER PROFILE CLOSE ──
window.closeWriterProfile = function() {
  const curr = navStack[navStack.length - 1];
  navStack.pop();
  const prev = navStack[navStack.length - 1];
  document.getElementById('writer-profile').classList.remove('visible');
  if(prev && prev.type === 'chat') {
    setMainState('chat');
  } else {
    setMainState('empty');
    if(isMobile()) showSidebar();
    document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
    const writersTab = [...document.querySelectorAll('.sb-tab')].find(t => t.textContent.trim() === 'Writers');
    if(writersTab) writersTab.classList.add('active');
    document.getElementById('chats-panel').style.display   = 'none';
    document.getElementById('writers-panel').style.display = 'flex';
    document.getElementById('rooms-panel').style.display   = 'none';
    loadWriters();
  }
};

// ── IN-APP BACK BUTTON ──
window.goBackToList = function() {
  if(navStack.length === 0) { showSidebar(); return; }
  navStack.pop();
  S.currentChatId = null;
  setMainState('empty');
  showSidebar();
};

// ── PHONE BACK BUTTON ──
window.addEventListener('popstate', () => {
  if(!isMobile()) return;
  if(navStack.length > 0) {
    const curr = navStack[navStack.length - 1];
    navStack.pop();
    if(curr.type === 'profile') {
      window.closeWriterProfile();
    } else if(curr.type === 'room-profile') {
      window.closeRoomProfile();
    } else if(curr.type === 'chat') {
      S.currentChatId = null;
      setMainState('empty');
      showSidebar();
    }
  } else {
    showSidebar();
    setMainState('empty');
    S.currentChatId = null;
    document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
    const chatsTab = document.querySelector('.sb-tab');
    if(chatsTab) chatsTab.classList.add('active');
    document.getElementById('chats-panel').style.display   = 'flex';
    document.getElementById('writers-panel').style.display = 'none';
    document.getElementById('rooms-panel').style.display   = 'none';
  }
});

// ── SEARCH ──
window.filterSearch = function(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.chat-item').forEach(i => {
    const name = i.querySelector('.chat-name')?.textContent?.toLowerCase()||'';
    i.style.display = name.includes(lower) ? '' : 'none';
  });
  document.querySelectorAll('.writer-item').forEach(i => {
    const name  = i.querySelector('.wname')?.textContent?.toLowerCase()||'';
    const email = i.querySelector('.wsub')?.textContent?.toLowerCase()||'';
    i.style.display = (name.includes(lower)||email.includes(lower)) ? '' : 'none';
  });
  document.querySelectorAll('.room-browse-item').forEach(i => {
    const name = i.querySelector('.room-browse-name')?.textContent?.toLowerCase()||'';
    const by   = i.querySelector('.room-browse-by')?.textContent?.toLowerCase()||'';
    i.style.display = (name.includes(lower)||by.includes(lower)) ? '' : 'none';
  });
};

// ── SIDEBAR MENU ──
window.toggleSbMenu = function(e) {
  e.stopPropagation(); e.preventDefault();
  document.getElementById('sb-menu').classList.toggle('show');
};
window.closeSbMenu = function() {
  document.getElementById('sb-menu').classList.remove('show');
};
document.addEventListener('click', (e) => {
  const menu = document.getElementById('sb-menu');
  const btn  = document.getElementById('sb-more-btn');
  if(menu && !menu.contains(e.target) && e.target !== btn) menu.classList.remove('show');
}, true);

// ── RESIZE ──
window.addEventListener('resize', () => {
  if(!isMobile()) {
    document.getElementById('sidebar').classList.remove('slide-out');
    document.getElementById('main').classList.remove('slide-in');
  }
});

// ── TEXTAREA ──
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('msg-textarea');
  if(!ta) return;
  ta.addEventListener('input', function() {
    this.style.height='auto';
    this.style.height=Math.min(this.scrollHeight,100)+'px';
  });
  ta.addEventListener('keydown', function(e) {
    if(e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); window.sendMessage(); }
  });
  // Close overlays on backdrop click
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if(e.target===o) o.classList.remove('show'); });
  });
});
