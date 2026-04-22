// chat.js — Firebase logic
// Handles: auth, messages, rooms, unlock transactions, writer profiles

import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut,
         updateEmail, updatePassword }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore,
         collection, doc, addDoc, getDoc, getDocs,
         setDoc, updateDoc, onSnapshot, query,
         where, orderBy, serverTimestamp,
         runTransaction, increment, limit,
         arrayUnion }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { S }                       from "./state.js";

// ── FIREBASE INIT ──
const firebaseConfig = {
  apiKey:            "AIzaSyCMVpe1C0YNP1J_o0k22Ld_l5v2BzFP2xA",
  authDomain:        "rytr-105a3.firebaseapp.com",
  projectId:         "rytr-105a3",
  storageBucket:     "rytr-105a3.firebasestorage.app",
  messagingSenderId: "76786224478",
  appId:             "1:76786224478:web:fc673130160534dae953cf"
};
const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── HELPERS (used by both files) ──
export function esc(s='') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
export function formatTime(d) {
  if(!d) return '';
  return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
}
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── AUTH GATE ──
onAuthStateChanged(auth, async user => {
  if(!user) { window.location.href = 'index.html'; return; }
  await user.reload();
  const freshUser = auth.currentUser;
  if(!freshUser || !freshUser.emailVerified) {
    window.location.href = 'index.html'; return;
  }
  S.currentUser = freshUser;
  let snap;
  try {
    snap = await getDoc(doc(db,'users', freshUser.uid));
  } catch(e) {
    await signOut(auth);
    window.location.href = 'index.html'; return;
  }
  if(!snap.exists()) { window.location.href = 'index.html'; return; }
  S.currentUserData = snap.data();
  if(S.currentUserData.blocked) { await signOut(auth); window.location.href = 'index.html'; return; }
  if(S.currentUserData.role === 'admin') { window.location.href = 'admin.html'; return; }
  document.getElementById('loading-screen').style.display = 'none';
  await initUI();
  listenBalance();
  loadChats();
  if(S.currentUserData.role === 'writer') {
    document.getElementById('lock-controls').classList.add('visible');
    document.getElementById('sb-earnings').style.display = '';
    document.getElementById('create-room-item').style.display = '';
    document.getElementById('sb-link-btn').style.display = '';
    document.getElementById('bio-item').style.display = '';
  }
});

async function initUI() {
  document.getElementById('balance-val').textContent = S.currentUserData.balance ?? 20;
  document.getElementById('earned-val').textContent  = S.currentUserData.earned  ?? 0;
  const urlParams    = new URLSearchParams(window.location.search);
  const inviteRoomId = urlParams.get('room');
  const inviteWriter = urlParams.get('writer');
  window.history.replaceState({}, '', 'chat.html');
  if(inviteRoomId)  await joinRoomById(inviteRoomId);
  else if(inviteWriter) await joinWriterDM(inviteWriter);
}

// ── REAL-TIME BALANCE ──
function listenBalance() {
  onSnapshot(doc(db,'users',S.currentUser.uid), snap => {
    if(!snap.exists()) return;
    S.currentUserData = snap.data();
    document.getElementById('balance-val').textContent = S.currentUserData.balance ?? 0;
    document.getElementById('earned-val').textContent  = S.currentUserData.earned  ?? 0;
  });
}

// ── LOAD CHATS / ROOMS ──
async function loadChats() {
  const dmQ = query(collection(db,'chats'), where('participants','array-contains', S.currentUser.uid));
  onSnapshot(dmQ, snap => {
    snap.docChanges().forEach(ch => {
      if(ch.type === 'removed') document.getElementById('ci-'+ch.doc.id)?.remove();
      else renderChatItem(ch.doc, 'dm');
    });
    sortChatList();
  });
  const roomQ = query(collection(db,'rooms'), orderBy('createdAt','desc'));
  onSnapshot(roomQ, snap => {
    snap.docChanges().forEach(ch => {
      if(ch.type === 'removed') document.getElementById('ci-'+ch.doc.id)?.remove();
      else renderChatItem(ch.doc, 'room');
    });
    sortChatList();
  });
}

function sortChatList() {
  const list  = document.getElementById('chat-list');
  const items = [...list.querySelectorAll('.chat-item')];
  items.sort((a,b) => (Number(b.dataset.ts)||0) - (Number(a.dataset.ts)||0));
  items.forEach(i => list.appendChild(i));
}

function renderChatItem(docSnap, type) {
  const data = docSnap.data();
  const id   = docSnap.id;
  const list = document.getElementById('chat-list');
  document.getElementById('ci-'+id)?.remove();
  const item = document.createElement('div');
  item.className = 'chat-item' + (id === S.currentChatId ? ' active' : '');
  item.id = 'ci-'+id;
  const ts = data.lastMessageAt?.seconds || data.createdAt?.seconds || Math.floor(Date.now()/1000);
  item.dataset.ts = ts;
  const time    = data.lastMessageAt?.toDate ? formatTime(data.lastMessageAt.toDate()) : '';
  const preview = data.lastMessage || '';
  let name, sub, initial;
  if(type === 'room') {
    name = data.name || 'Room'; sub = `<span class="by-writer">by ${data.creatorName||'Writer'}</span>`; initial = (name[0]||'R').toUpperCase();
  } else {
    const otherId = (data.participants||[]).find(p => p !== S.currentUser.uid);
    name = data.participantNames?.[otherId] || 'User'; sub = ''; initial = (name[0]||'U').toUpperCase();
  }
  item.innerHTML = `
    <div class="chat-avatar">${initial}</div>
    <div class="chat-info">
      <div class="chat-name">${name}${type==='room'?'<span class="room-tag">Room</span>':''}</div>
      ${sub}
      <div class="chat-meta">
        <span class="chat-tick">✓✓</span>
        <span class="chat-preview">${esc(preview)}</span>
        <span class="chat-time">${time}</span>
      </div>
    </div>`;
  item.onclick = () => openChat(id, type, { name, sub: type==='room'?`by ${data.creatorName||'Writer'}`:'' });
  list.appendChild(item);
  if(!S.chatListeners[id]) { S.chatListeners[id] = true; listenUnreadForChat(id, type); }
}

// ── OPEN CHAT ──
export async function openChat(chatId, type, meta) {
  Object.entries(S.msgListeners).forEach(([k,v]) => { if(Array.isArray(v)) v.forEach(fn=>fn()); else v(); });
  Object.keys(S.msgListeners).forEach(k => delete S.msgListeners[k]);
  const wrap = document.getElementById('messages-wrap');
  wrap.innerHTML = '';
  S.unlockDataMap.clear();
  S.currentChatId   = chatId;
  S.currentChatType = type;
  S.currentChatMeta = meta;
  // Import nav function at runtime to avoid circular dependency
  const { revealChat } = await import('./ui.js');
  revealChat(chatId, type, meta);
  const placeholder = document.createElement('div');
  placeholder.id = 'chat-placeholder';
  placeholder.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#bbb;gap:10px;pointer-events:none;user-select:none';
  placeholder.innerHTML = `<div style="font-size:44px">💬</div><div style="font-size:13px;font-weight:500">Send a message to start the conversation</div>`;
  wrap.appendChild(placeholder);
  const colPath = type==='room' ? `rooms/${chatId}/messages` : `chats/${chatId}/messages`;
  const msgQ    = query(collection(db, colPath), orderBy('createdAt','asc'));
  S.msgListeners[chatId] = onSnapshot(msgQ, snap => {
    if(S.currentChatId !== chatId) return;
    snap.docChanges().forEach(ch => {
      if(ch.type === 'added') {
        document.getElementById('chat-placeholder')?.remove();
        appendMessage(ch.doc, colPath);
        if(ch.doc.data().senderId !== S.currentUser.uid) {
          const readBy = ch.doc.data().readBy || [];
          if(!readBy.includes(S.currentUser.uid))
            updateDoc(ch.doc.ref, { readBy: arrayUnion(S.currentUser.uid) }).catch(()=>{});
        }
      }
    });
  });
}

// ── RENDER MESSAGE ──
async function appendMessage(docSnap, colPath) {
  const data  = docSnap.data();
  const msgId = docSnap.id;
  const wrap  = document.getElementById('messages-wrap');
  if(document.getElementById('msg-'+msgId)) return;
  const isMe  = data.senderId === S.currentUser.uid;
  const row   = document.createElement('div');
  row.className = `msg-row ${isMe?'outgoing':'incoming'}`;
  row.id = 'msg-'+msgId;
  wrap.appendChild(row);
  const time = data.createdAt?.toDate ? formatTime(data.createdAt.toDate()) : formatTime(new Date());

  if(!data.locked) {
    const readBy  = data.readBy || [];
    const isRead  = readBy.some(uid => uid !== S.currentUser.uid);
    const tickClr = isMe ? (isRead ? '#fff' : 'rgba(255,255,255,.45)') : 'var(--blue)';
    row.innerHTML = `
      ${!isMe ? `<div class="msg-avi">${(data.senderName||'U')[0].toUpperCase()}</div>` : ''}
      <div class="bubble ${isMe?'outgoing':'incoming'}">
        ${!isMe && S.currentChatType==='room' ? `<div class="bubble-name">${esc(data.senderName||'')}</div>` : ''}
        <div>${esc(data.text)}</div>
        <div class="bubble-time">${time}${isMe?`<span class="tick" id="tick-${msgId}" style="color:${tickClr}" title="${isRead?'Read':'Delivered'}">✓✓</span>`:''}</div>
      </div>`;
    if(isMe) {
      const tickUnsub = onSnapshot(docSnap.ref, snap => {
        if(S.currentChatId !== (colPath.split('/')[1])) { tickUnsub(); return; }
        const rb   = snap.data()?.readBy || [];
        const read = rb.some(uid => uid !== S.currentUser.uid);
        const tick = document.getElementById('tick-'+msgId);
        if(tick) { tick.style.color = read?'#fff':'rgba(255,255,255,.45)'; tick.title = read?'Read':'Delivered'; }
      });
      if(!S.msgListeners['_uc_'+S.currentChatId]) S.msgListeners['_uc_'+S.currentChatId] = [];
      S.msgListeners['_uc_'+S.currentChatId].push(tickUnsub);
    }
  } else if(isMe) {
    row.innerHTML = `
      <div class="own-locked">
        <div class="own-locked-top">
          <span class="own-locked-label">🔒 Locked</span>
          <span class="own-locked-price">🪙 ${data.price} pts</span>
        </div>
        <div class="own-locked-text">${esc(data.text)}</div>
        <div class="bubble-time" style="text-align:right;font-size:10px;color:#aaa;">${time}</div>
        <div class="own-locked-stats">
          <div class="stat">Unlocked by <b id="uc-${msgId}">${data.unlockCount||0}</b></div>
          <div class="stat">Earned <b id="ue-${msgId}">🪙 ${(data.unlockCount||0)*data.price}</b></div>
        </div>
      </div>`;
    listenUnlockCount(docSnap.ref, msgId, data.price, S.currentChatId);
  } else {
    S.unlockDataMap.set(msgId, { colPath, senderName: data.senderName||'', price: data.price, senderId: data.senderId });
    const unlockCount = data.unlockCount || 0;
    const fomoText    = unlockCount > 0 ? `<div class="locked-fomo">🔥 ${unlockCount} ${unlockCount===1?'person has':'people have'} unlocked this</div>` : '';
    row.innerHTML = `
      ${!isMe ? `<div class="msg-avi">${(data.senderName||'U')[0].toUpperCase()}</div>` : ''}
      <div class="locked-card" id="lc-${msgId}">
        <div class="locked-card-body">
          <div class="sender-name">${esc(data.senderName||'')}</div>
          <div class="blurred-text">${esc(data.text)}</div>
          ${fomoText}
        </div>
        <div class="unlock-bar" onclick="window.openUnlock('${msgId}')">
          <span class="ul-text">Unlock &amp; Read</span>
          <span class="ul-price">${data.price} Points</span>
        </div>
      </div>`;
    const unlockRef  = doc(db, `unlocks/${S.currentUser.uid}_${msgId}`);
    const unlockSnap = await getDoc(unlockRef);
    if(S.currentChatId !== (colPath.split('/')[1])) return;
    if(unlockSnap.exists()) {
      row.innerHTML = `
        <div class="msg-avi">${(data.senderName||'U')[0].toUpperCase()}</div>
        <div class="revealed-card">
          <div class="revealed-card-body">
            ${S.currentChatType==='room' ? `<div class="bubble-name">${esc(data.senderName||'')}</div>` : ''}
            <div style="font-size:14px;line-height:1.6">${esc(data.text)}</div>
            <div class="bubble-time">${time}</div>
            <div class="revealed-badge">✓ Unlocked · ${data.price} pts spent</div>
          </div>
        </div>`;
    }
  }
  wrap.scrollTop = wrap.scrollHeight;
}

function listenUnlockCount(ref, msgId, price, chatId) {
  const unsub = onSnapshot(ref, snap => {
    if(S.currentChatId !== chatId) { unsub(); return; }
    if(!snap.exists()) return;
    const d  = snap.data();
    const uc = document.getElementById('uc-'+msgId);
    const ue = document.getElementById('ue-'+msgId);
    if(uc) uc.textContent = d.unlockCount||0;
    if(ue) ue.textContent = `🪙 ${(d.unlockCount||0)*price}`;
  });
  if(!S.msgListeners['_uc_'+chatId]) S.msgListeners['_uc_'+chatId] = [];
  S.msgListeners['_uc_'+chatId].push(unsub);
}

// ── UNREAD BADGES ──
function listenUnreadForChat(chatId, type) {
  const colPath = type==='room' ? `rooms/${chatId}/messages` : `chats/${chatId}/messages`;
  const q = query(collection(db, colPath), orderBy('createdAt','desc'), limit(30));
  onSnapshot(q, snap => {
    if(S.currentChatId === chatId) { updateBadge(chatId, 0); return; }
    let count = 0;
    snap.forEach(d => {
      const msg = d.data();
      if(msg.senderId !== S.currentUser.uid) {
        if(!(msg.readBy||[]).includes(S.currentUser.uid)) count++;
      }
    });
    updateBadge(chatId, count);
  });
}

function updateBadge(chatId, count) {
  S.unreadCounts[chatId] = count;
  const item = document.getElementById('ci-'+chatId);
  if(!item) return;
  let badge = item.querySelector('.chat-badge');
  if(count > 0) {
    if(!badge) { badge = document.createElement('div'); badge.className='chat-badge'; item.appendChild(badge); }
    badge.textContent = count > 99 ? '99+' : count;
  } else { badge?.remove(); }
}

// ── SEND MESSAGE ──
window.sendMessage = async function() {
  const textarea = document.getElementById('msg-textarea');
  const text = textarea.value.trim();
  if(!text || !S.currentChatId) return;
  const price   = parseInt(document.getElementById('price-select').value)||10;
  const colPath = S.currentChatType==='room' ? `rooms/${S.currentChatId}/messages` : `chats/${S.currentChatId}/messages`;
  const canLock = S.currentUserData.role === 'writer';
  const locked  = canLock && S.isLocked;
  const msgData = {
    senderId:    S.currentUser.uid,
    senderName:  S.currentUserData.displayName || S.currentUser.displayName || 'User',
    text, locked,
    price:       locked ? price : 0,
    unlockCount: 0,
    readBy:      [S.currentUser.uid],
    createdAt:   serverTimestamp()
  };
  textarea.value = ''; textarea.style.height = 'auto';
  try {
    await addDoc(collection(db, colPath), msgData);
    const topRef = doc(db, S.currentChatType==='room'?'rooms':'chats', S.currentChatId);
    await updateDoc(topRef, { lastMessage: locked?`🔒 Locked · ${price} pts`:text.slice(0,60), lastMessageAt: serverTimestamp() });
    if(locked) {
      S.isLocked = false;
      document.getElementById('lock-btn').classList.remove('locked');
      document.getElementById('lock-btn').textContent = '🔓';
      document.getElementById('price-select').classList.remove('visible');
    }
  } catch(e) { toast('Failed to send. Try again.'); }
};

// ── LOCK TOGGLE ──
window.toggleLock = function() {
  if(S.currentUserData.role !== 'writer') return;
  S.isLocked = !S.isLocked;
  const btn = document.getElementById('lock-btn');
  const sel = document.getElementById('price-select');
  btn.classList.toggle('locked', S.isLocked);
  btn.textContent = S.isLocked ? '🔒' : '🔓';
  sel.classList.toggle('visible', S.isLocked);
};

// ── UNLOCK ──
window.openUnlock = function(msgId) {
  const d = S.unlockDataMap.get(msgId);
  if(!d) { toast('Could not load message data.'); return; }
  S.pendingUnlockData = { msgId, ...d };
  const bal   = S.currentUserData.balance||0;
  const after = bal - d.price;
  document.getElementById('ul-sender').textContent  = d.senderName;
  document.getElementById('ul-price').textContent   = `${d.price} Points`;
  document.getElementById('ul-balance').textContent = `${bal} Points`;
  const afterEl = document.getElementById('ul-after');
  afterEl.textContent = `${after} Points`;
  afterEl.className   = after < 0 ? 'v danger' : 'v';
  document.getElementById('ul-warn').style.display    = after < 0 ? '' : 'none';
  const btn = document.getElementById('ul-confirm');
  btn.disabled = after < 0; btn.textContent = after < 0 ? 'Not enough Points' : 'Unlock 🔓';
  document.getElementById('unlock-overlay').classList.add('show');
};

window.confirmUnlock = async function() {
  if(!S.pendingUnlockData) return;
  const { msgId, colPath, price, senderId } = S.pendingUnlockData;
  const btn = document.getElementById('ul-confirm');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    await runTransaction(db, async tx => {
      const readerRef  = doc(db,'users',S.currentUser.uid);
      const writerRef  = doc(db,'users',senderId);
      const unlockRef  = doc(db,`unlocks/${S.currentUser.uid}_${msgId}`);
      const msgRef     = doc(db,colPath,msgId);
      const readerSnap = await tx.get(readerRef);
      const unlockSnap = await tx.get(unlockRef);
      if(unlockSnap.exists()) throw new Error('already_unlocked');
      const bal = readerSnap.data().balance||0;
      if(bal < price) throw new Error('insufficient');
      tx.update(readerRef, { balance: bal - price });
      tx.update(writerRef, { earned: increment(price), balance: increment(price) });
      tx.set(unlockRef,   { userId: S.currentUser.uid, msgId, price, unlockedAt: serverTimestamp() });
      tx.update(msgRef,   { unlockCount: increment(1) });
    });
    window.closeOverlay('unlock-overlay');
    toast('🔓 Unlocked!');
    const msgSnap = await getDoc(doc(db,colPath,msgId));
    const d = msgSnap.data();
    const row = document.getElementById('msg-'+msgId);
    if(row) {
      row.innerHTML = `
        <div class="msg-avi">${(d.senderName||'U')[0].toUpperCase()}</div>
        <div class="revealed-card">
          <div class="revealed-card-body">
            <div class="bubble-name">${esc(d.senderName||'')}</div>
            <div style="font-size:14px;line-height:1.6">${esc(d.text)}</div>
            <div class="bubble-time">${formatTime(new Date())}</div>
            <div class="revealed-badge">✓ Unlocked · ${price} pts spent</div>
          </div>
        </div>`;
    }
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Unlock 🔓';
    if(e.message==='already_unlocked') { toast('Already unlocked!'); window.closeOverlay('unlock-overlay'); }
    else if(e.message==='insufficient') toast('Not enough Points!');
    else toast('Transaction failed. Try again.');
  }
};

// ── ADD POINTS ──
window.openAddPoints = function() { S.selectedPtsAmt=0; document.querySelectorAll('.pt-opt').forEach(o=>o.classList.remove('sel')); document.getElementById('addpoints-overlay').classList.add('show'); };
window.selectPts = function(el,amt) { document.querySelectorAll('.pt-opt').forEach(o=>o.classList.remove('sel')); el.classList.add('sel'); S.selectedPtsAmt=amt; };
window.confirmAddPoints = async function() {
  if(!S.selectedPtsAmt) { toast('Pick a package first'); return; }
  await updateDoc(doc(db,'users',S.currentUser.uid), { balance: increment(S.selectedPtsAmt) });
  window.closeOverlay('addpoints-overlay');
  toast(`✅ ${S.selectedPtsAmt} Points added!`);
};

// ── FIND WRITERS ──
export async function loadWriters() {
  const list = document.getElementById('writers-list');
  list.innerHTML = '<div style="padding:16px;color:#aaa;font-size:13px">Loading writers...</div>';
  try {
    const snap = await getDocs(collection(db,'users'));
    list.innerHTML = ''; let count = 0;
    snap.forEach(d => {
      const wr = d.data();
      if(wr.role !== 'writer' || wr.uid === S.currentUser.uid || wr.blocked) return;
      count++;
      const item = document.createElement('div');
      item.className = 'writer-item'; item.style.cursor='pointer';
      item.innerHTML = `
        <div class="writer-avi">${(wr.displayName||'W')[0].toUpperCase()}</div>
        <div class="writer-info">
          <div class="wname">${esc(wr.displayName||'Writer')}</div>
          <div class="wsub">${wr.email||''}</div>
        </div>
        <span style="font-size:11px;color:var(--blue);flex-shrink:0">View →</span>`;
      item.onclick = () => openWriterProfile(wr, 'list');
      list.appendChild(item);
    });
    if(count===0) list.innerHTML = '<div style="padding:16px;color:#aaa;font-size:13px">No writers found.</div>';
  } catch(e) { list.innerHTML = `<div style="padding:16px;color:red;font-size:12px">Error: ${e.message}</div>`; }
}

// ── WRITER PROFILE ──
let writerProfileSource = 'list';
export async function openWriterProfile(wr, source='list') {
  writerProfileSource = source;
  const { setMainState, showMain, pushNav } = await import('./ui.js');
  setMainState('profile'); showMain();
  pushNav({ type:'profile', writerData: wr });
  document.getElementById('wp-avi').textContent   = (wr.displayName||'W')[0].toUpperCase();
  document.getElementById('wp-name').textContent  = wr.displayName || 'Writer';
  document.getElementById('wp-email').textContent = wr.email || '';
  document.getElementById('wp-bio').textContent   = wr.bio || 'This writer hasn\'t added a bio yet.';
  document.getElementById('wp-unlocks').textContent = wr.earned || 0;
  document.getElementById('wp-unlocks').nextElementSibling.textContent = 'Points Earned';
  document.getElementById('wp-rooms-count').textContent = '...';
  document.getElementById('wp-chat-btn').onclick = async () => {
    const { setMainState: sm } = await import('./ui.js');
    sm('empty'); await startDM(wr.uid, wr.displayName||'Writer');
  };
  const roomsList = document.getElementById('wp-rooms-list');
  roomsList.innerHTML = '<div style="font-size:13px;color:#bbb">Loading rooms...</div>';
  try {
    const allRooms = await getDocs(collection(db,'rooms'));
    const writerRooms = []; allRooms.forEach(rd => { if(rd.data().createdBy===wr.uid) writerRooms.push(rd); });
    document.getElementById('wp-rooms-count').textContent = writerRooms.length;
    roomsList.innerHTML = '';
    if(writerRooms.length===0) { roomsList.innerHTML='<div style="font-size:13px;color:#bbb;padding:8px 0">No rooms yet.</div>'; return; }
    writerRooms.forEach(rd => {
      const room = rd.data();
      const card = document.createElement('div'); card.className='wp-room-card';
      card.innerHTML = `
        <div class="wp-room-icon">${(room.name||'R')[0].toUpperCase()}</div>
        <div class="wp-room-info">
          <div class="wp-room-name">${esc(room.name||'Room')}</div>
          <div class="wp-room-sub">by ${esc(room.creatorName||wr.displayName||'Writer')}</div>
        </div>
        <button class="wp-room-join">Join</button>`;
      const enter = () => { window.closeWriterProfile(); openChat(rd.id,'room',{name:room.name,sub:`by ${room.creatorName||wr.displayName}`}); };
      card.querySelector('.wp-room-join').onclick = e => { e.stopPropagation(); enter(); };
      card.onclick = enter;
      roomsList.appendChild(card);
    });
  } catch(e) { roomsList.innerHTML=`<div style="font-size:12px;color:red">Could not load rooms: ${e.message}</div>`; }
}

// ── ROOM BROWSER ──
export async function loadRoomsBrowse() {
  const list = document.getElementById('rooms-browse-list');
  list.innerHTML = '<div style="padding:16px;color:#aaa;font-size:13px">Loading rooms...</div>';
  try {
    const snap = await getDocs(collection(db,'rooms'));
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML='<div style="padding:16px;color:#aaa;font-size:13px">No rooms yet.</div>'; return; }
    const docs = []; snap.forEach(d => docs.push(d));
    docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0));
    docs.forEach(d => {
      const room = d.data();
      const item = document.createElement('div'); item.className='room-browse-item';
      item.innerHTML = `
        <div class="room-browse-avi">${(room.name||'R')[0].toUpperCase()}</div>
        <div class="room-browse-info">
          <div class="room-browse-name">${esc(room.name||'Room')}</div>
          <div class="room-browse-by">by ${esc(room.creatorName||'Writer')}</div>
        </div>
        <button class="room-join-btn">Join</button>`;
      const join = () => { window.switchTab('chats',document.querySelector('.sb-tab')); openChat(d.id,'room',{name:room.name,sub:`by ${room.creatorName||'Writer'}`}); };
      item.querySelector('.room-join-btn').onclick = e => { e.stopPropagation(); join(); };
      item.onclick = join;
      list.appendChild(item);
    });
  } catch(e) { list.innerHTML=`<div style="padding:16px;color:red;font-size:12px">Error: ${e.message}</div>`; }
}

// ── START DM ──
window.startDM = async function(writerId, writerName) {
  const chatId  = [S.currentUser.uid, writerId].sort().join('_');
  const chatRef = doc(db,'chats',chatId);
  const snap    = await getDoc(chatRef);
  if(!snap.exists()) {
    await setDoc(chatRef, {
      participants:     [S.currentUser.uid, writerId],
      participantNames: { [S.currentUser.uid]: S.currentUserData.displayName||'User', [writerId]: writerName },
      lastMessage:'', lastMessageAt: serverTimestamp()
    });
  }
  openChat(chatId,'dm',{name:writerName,sub:'Direct Message'});
};

// ── CREATE ROOM ──
window.createRoom = async function() {
  const name = document.getElementById('room-name-input').value.trim();
  if(!name) { toast('Enter a room name'); return; }
  const btn = document.querySelector('#room-overlay .modal-confirm');
  btn.disabled=true; btn.textContent='Checking...';
  try {
    await S.currentUser.getIdToken(true);
    const allRooms = await getDocs(collection(db,'rooms'));
    const myRooms  = []; allRooms.forEach(d => { if(d.data().createdBy===S.currentUser.uid) myRooms.push(d); });
    const roomCount = myRooms.length;
    if(roomCount >= 10) {
      const bal = S.currentUserData.balance||0;
      if(bal < 50) { toast(`You need 50 Points to create more than 10 rooms. Balance: ${bal} pts.`); btn.disabled=false; btn.textContent='Create Room'; return; }
      const confirmed = confirm(`You have ${roomCount} rooms (free limit: 10).\nCreating another costs 50 Points.\nBalance: ${bal} pts.\n\nProceed?`);
      if(!confirmed) { btn.disabled=false; btn.textContent='Create Room'; return; }
      await runTransaction(db, async tx => {
        const userRef  = doc(db,'users',S.currentUser.uid);
        const userSnap = await tx.get(userRef);
        const curBal   = userSnap.data().balance||0;
        if(curBal < 50) throw new Error('insufficient');
        tx.update(userRef, { balance: curBal-50 });
      });
    }
    const ref = await addDoc(collection(db,'rooms'), {
      name, createdBy: S.currentUser.uid, creatorName: S.currentUserData.displayName||'Writer',
      lastMessage:'', lastMessageAt: serverTimestamp(), createdAt: serverTimestamp()
    });
    document.getElementById('room-name-input').value='';
    window.closeOverlay('room-overlay');
    toast('✅ Room created!');
    openChat(ref.id,'room',{name,sub:`by ${S.currentUserData.displayName}`});
  } catch(e) {
    if(e.message==='insufficient') toast('Not enough Points to create a room.');
    else toast(`Failed: ${e.message}`);
  } finally { btn.disabled=false; btn.textContent='Create Room'; }
};

// ── HEADER CLICK → WRITER PROFILE ──
window.onHeaderClick = async function() {
  if(S.currentChatType !== 'dm') return;
  const otherUid = S.currentChatId?.split('_').find(u => u !== S.currentUser.uid);
  if(!otherUid) return;
  try {
    const snap = await getDoc(doc(db,'users',otherUid));
    if(!snap.exists()) { toast('Could not load profile.'); return; }
    const wr = snap.data();
    if(wr.role !== 'writer') return;
    await openWriterProfile(wr, 'chat');
  } catch(e) { toast('Could not load profile.'); }
};

// ── INVITE LINK ──
window.showWriterProfileLink = function() {
  const link = `${location.origin}/chat.html?writer=${S.currentUser.uid}`;
  navigator.clipboard.writeText(link).then(() => toast('✅ Your chat link copied! Share it with readers.')).catch(() => prompt('Copy your invite link:', link));
};
window.copyWriterLink = function(writerId, e) {
  e.stopPropagation();
  const link = `${location.origin}/chat.html?writer=${writerId}`;
  navigator.clipboard.writeText(link).then(() => toast('✅ Writer chat link copied!')).catch(() => prompt('Copy this link:', link));
};
window.showInviteLink = function() {
  const link = `${location.origin}/chat.html?room=${S.currentChatId}`;
  document.getElementById('invite-link-box').textContent = link;
  document.getElementById('invite-overlay').classList.add('show');
};
window.copyInviteLink = function() {
  const link = document.getElementById('invite-link-box').textContent;
  navigator.clipboard.writeText(link).then(() => { toast('✅ Link copied!'); window.closeOverlay('invite-overlay'); }).catch(() => { const el=document.getElementById('invite-link-box'); const r=document.createRange(); r.selectNodeContents(el); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); });
};

async function joinRoomById(roomId) {
  try {
    const snap = await getDoc(doc(db,'rooms',roomId));
    if(!snap.exists()) { toast('Room not found.'); return; }
    const room = snap.data();
    openChat(roomId,'room',{name:room.name||'Room',sub:`by ${room.creatorName||'Writer'}`});
    toast(`✅ Joined "${room.name}"!`);
  } catch(e) { toast('Could not join room.'); }
}

async function joinWriterDM(writerId) {
  try {
    const snap = await getDoc(doc(db,'users',writerId));
    if(!snap.exists()) { toast('Writer not found.'); return; }
    const { switchTab } = await import('./ui.js');
    switchTab('writers', document.querySelector('.sb-tab:last-child'));
    await openWriterProfile(snap.data(), 'list');
  } catch(e) { toast('Could not load writer profile.'); }
}

export function updateInviteBtn(chatId, type) {
  const btn = document.getElementById('invite-btn');
  btn.style.display = (type==='room' && S.currentUserData?.role==='writer') ? '' : 'none';
}

// ── SETTINGS ──
window.openSettings = function(type) {
  S.settingsType = type;
  window.closeSbMenu();
  const titles = { email:'Change Email', password:'Change Password', mobile:'Mobile Number', bio:'Edit Bio' };
  document.getElementById('settings-title').textContent = titles[type]||'Settings';
  const c = document.getElementById('settings-content');
  if(type==='email') {
    c.innerHTML=`<div class="field"><label style="font-size:13px;color:#666;display:block;margin-bottom:7px;font-weight:500">New Email</label><input type="email" id="set-email" value="${S.currentUser.email||''}" style="width:100%;padding:11px 14px;background:#F5F5F5;border:1.5px solid transparent;border-radius:10px;font-size:14px;font-family:Roboto,sans-serif;outline:none"/></div>`;
  } else if(type==='password') {
    c.innerHTML=`<div class="field"><label style="font-size:13px;color:#666;display:block;margin-bottom:7px;font-weight:500">New Password</label><input type="password" id="set-pass" placeholder="Min 6 chars" style="width:100%;padding:11px 14px;background:#F5F5F5;border:1.5px solid transparent;border-radius:10px;font-size:14px;font-family:Roboto,sans-serif;outline:none"/></div>`;
  } else if(type==='mobile') {
    c.innerHTML=`<div class="field"><label style="font-size:13px;color:#666;display:block;margin-bottom:7px;font-weight:500">Mobile Number</label><input type="tel" id="set-mobile" value="${S.currentUserData.mobile||''}" placeholder="+880..." style="width:100%;padding:11px 14px;background:#F5F5F5;border:1.5px solid transparent;border-radius:10px;font-size:14px;font-family:Roboto,sans-serif;outline:none"/></div>`;
  } else if(type==='bio') {
    c.innerHTML=`<div class="field"><label style="font-size:13px;color:#666;display:block;margin-bottom:7px;font-weight:500">Your Bio</label><textarea id="set-bio" rows="4" placeholder="Tell readers about yourself..." style="width:100%;padding:11px 14px;background:#F5F5F5;border:1.5px solid transparent;border-radius:10px;font-size:14px;font-family:Roboto,sans-serif;outline:none;resize:none">${esc(S.currentUserData.bio||'')}</textarea></div>`;
  }
  document.getElementById('settings-overlay').classList.add('show');
};
window.saveSettings = async function() {
  try {
    if(S.settingsType==='email') { const e=document.getElementById('set-email').value.trim(); await updateEmail(S.currentUser,e); toast('Email updated!'); }
    else if(S.settingsType==='password') { const p=document.getElementById('set-pass').value; if(p.length<6){toast('Password too short');return;} await updatePassword(S.currentUser,p); toast('Password updated!'); }
    else if(S.settingsType==='mobile') { const m=document.getElementById('set-mobile').value.trim(); await updateDoc(doc(db,'users',S.currentUser.uid),{mobile:m}); S.currentUserData.mobile=m; toast('Mobile saved!'); }
    else if(S.settingsType==='bio') { const b=document.getElementById('set-bio').value.trim(); await updateDoc(doc(db,'users',S.currentUser.uid),{bio:b}); S.currentUserData.bio=b; toast('Bio updated!'); }
    window.closeOverlay('settings-overlay');
  } catch(e) { toast('Update failed: '+e.message); }
};

window.doLogout = async function() { await signOut(auth); window.location.href='index.html'; };
window.closeOverlay = function(id) { document.getElementById(id).classList.remove('show'); };
window.toast = toast;
