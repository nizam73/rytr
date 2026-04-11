// Paste your Firebase config here
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_ID",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Signup
function signup() {
  auth.createUserWithEmailAndPassword(
    email.value, password.value
  );
}

// Login
function login() {
  auth.signInWithEmailAndPassword(
    email.value, password.value
  );
}

// Send Message
function sendMessage() {
  db.collection("messages").add({
    text: message.value,
    user: auth.currentUser.email,
    time: Date.now()
  });
}

// Realtime Chat Listener
db.collection("messages")
  .orderBy("time")
  .onSnapshot(snapshot => {
    chat.innerHTML = "";
    snapshot.forEach(doc => {
      let li = document.createElement("li");
      li.innerText = doc.data().user + ": " + doc.data().text;
      chat.appendChild(li);
    });
  });