import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, limit } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// YOUR CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCMVpe1C0YNP1J_o0k22Ld_l5v2BzFP2xA",
  authDomain: "rytr-105a3.firebaseapp.com",
  projectId: "rytr-105a3",
  storageBucket: "rytr-105a3.firebasestorage.app",
  messagingSenderId: "76786224478",
  appId: "1:76786224478:web:fc673130160534dae953cf"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Elements
const authBox = document.getElementById("authBox");
const chatBox = document.getElementById("chatBox");
const chat = document.getElementById("chat");
const message = document.getElementById("message");

// Auth state (AUTO LOGIN)
onAuthStateChanged(auth, (user) => {
  if (user) {
    authBox.classList.add("hidden");
    chatBox.classList.remove("hidden");
  } else {
    authBox.classList.remove("hidden");
    chatBox.classList.add("hidden");
  }
});

// Signup
window.signup = async () => {
  await createUserWithEmailAndPassword(
    auth,
    email.value,
    password.value
  ).catch(e => alert(e.message));
};

// Login
window.login = async () => {
  await signInWithEmailAndPassword(
    auth,
    email.value,
    password.value
  ).catch(e => alert(e.message));
};

// Logout
window.logout = async () => {
  await signOut(auth);
};

// Send Message
window.sendMessage = async () => {
  if (!auth.currentUser) return;

  await addDoc(collection(db, "messages"), {
    text: message.value,
    user: auth.currentUser.email,
    time: Date.now()
  });

  message.value = "";
};

// Realtime Messages (last 50)
const q = query(
  collection(db, "messages"),
  orderBy("time"),
  limit(50)
);

onSnapshot(q, (snapshot) => {
  chat.innerHTML = "";

  snapshot.forEach((doc) => {
    const data = doc.data();

    const div = document.createElement("div");
    div.classList.add("message");

    if (auth.currentUser && data.user === auth.currentUser.email) {
      div.classList.add("me");
    } else {
      div.classList.add("other");
    }

    div.innerText = data.text;
    chat.appendChild(div);
  });

  // Auto scroll
  chat.scrollTop = chat.scrollHeight;
});
