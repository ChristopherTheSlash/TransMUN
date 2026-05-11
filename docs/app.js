import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { adminEmails, firebaseConfig } from "./firebase-config.js";

const state = {
  authReady: false,
  user: null,
  mode: "delegate",
  roomId: "main",
  unsubscribeMessages: null,
  unsubscribeDocuments: null
};

const els = {
  connection: document.querySelector("#connection"),
  signOut: document.querySelector("#sign-out"),
  pageTitle: document.querySelector("#page-title"),
  loginPage: document.querySelector("#login-page"),
  delegatePage: document.querySelector("#delegate-page"),
  adminPage: document.querySelector("#admin-page"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  delegateRoom: document.querySelector("#delegate-room"),
  adminRoom: document.querySelector("#admin-room"),
  delegateMessages: document.querySelector("#delegate-messages-feed"),
  adminMessages: document.querySelector("#admin-messages-feed"),
  delegateMessageForm: document.querySelector("#delegate-message-form"),
  delegateMessageTo: document.querySelector("#delegate-message-to"),
  delegateMessageBody: document.querySelector("#delegate-message-body"),
  adminMessageForm: document.querySelector("#admin-message-form"),
  adminMessageTo: document.querySelector("#admin-message-to"),
  adminMessageBody: document.querySelector("#admin-message-body"),
  delegateDocuments: document.querySelector("#delegate-documents"),
  adminDocuments: document.querySelector("#admin-documents-list"),
  documentForm: document.querySelector("#document-link-form"),
  documentTitle: document.querySelector("#document-title"),
  documentUrl: document.querySelector("#document-url"),
  documentNote: document.querySelector("#document-note"),
  documentStatus: document.querySelector("#document-status"),
  emptyTemplate: document.querySelector("#empty-template")
};

const hasConfig = !Object.values(firebaseConfig)
  .filter((value) => typeof value === "string")
  .some((value) => value.startsWith("PASTE_"));

let auth;
let db;

if (hasConfig) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    state.authReady = true;
    state.user = user;

    if (!user) {
      closeSubscriptions();
      setConnection("Ready", "");
      showPage("login");
      return;
    }

    state.mode = isAdmin(user.email) ? "admin" : "delegate";
    setConnection(user.email || "Signed in", "online");
    openWorkspace();
  });
} else {
  setConnection("Add Firebase config", "warn");
}

restoreLoginState();
renderEmpty(els.delegateMessages);
renderEmpty(els.adminMessages);
renderEmpty(els.delegateDocuments);
renderEmpty(els.adminDocuments);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab));
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.authReady && hasConfig) {
    setConnection("Firebase is still connecting", "warn");
    return;
  }

  localStorage.setItem("transmun.room", JSON.stringify({
    roomId: state.roomId,
    email: els.loginEmail.value.trim()
  }));

  try {
    setConnection("Signing in...", "");
    await signInWithEmailAndPassword(auth, els.loginEmail.value.trim(), els.loginPassword.value);
  } catch (error) {
    setConnection(readableAuthError(error), "warn");
  }
});

els.signOut.addEventListener("click", async () => {
  closeSubscriptions();
  state.roomId = "main";
  await signOut(auth);
});

els.delegateMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage(els.delegateMessageTo, els.delegateMessageBody);
});

els.adminMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage(els.adminMessageTo, els.adminMessageBody);
});

els.documentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canUseRoom()) return;

  const title = els.documentTitle.value.trim();
  const url = els.documentUrl.value.trim();
  const note = els.documentNote.value.trim();
  if (!title || !url) return;

  const button = els.documentForm.querySelector("button");
  button.disabled = true;
  setDocumentStatus("Posting document link...");

  try {
    await addDoc(collection(db, "rooms", state.roomId, "documents"), {
      type: "document",
      title,
      url,
      note: note || "No note provided.",
      senderName: displayName(),
      senderRole: "Chair",
      senderId: state.user.uid,
      createdAt: serverTimestamp()
    });

    els.documentTitle.value = "";
    els.documentUrl.value = "";
    els.documentNote.value = "";
    setDocumentStatus("Document link posted.");
  } catch (error) {
    const message = readableFirestoreError(error);
    setDocumentStatus(message, "warn");
    setConnection(message, "warn");
  } finally {
    button.disabled = false;
  }
});

function openWorkspace() {
  const roomText = "Room: main";
  els.delegateRoom.textContent = roomText;
  els.adminRoom.textContent = roomText;
  showPage(state.mode);
  subscribeToRoom();
}

function showPage(page) {
  els.loginPage.classList.toggle("active", page === "login");
  els.delegatePage.classList.toggle("active", page === "delegate");
  els.adminPage.classList.toggle("active", page === "admin");
  els.signOut.classList.toggle("hidden", page === "login");

  if (page === "admin") {
    els.pageTitle.textContent = "Admin panel";
  } else if (page === "delegate") {
    els.pageTitle.textContent = "Delegate workspace";
  } else {
    els.pageTitle.textContent = "Delegate and chair portal";
  }
}

function switchTab(tab) {
  const scope = tab.dataset.scope;
  document.querySelectorAll(`.tab[data-scope="${scope}"]`).forEach((node) => node.classList.remove("active"));
  tab.classList.add("active");

  const page = scope === "admin" ? els.adminPage : els.delegatePage;
  page.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${tab.dataset.view}`).classList.add("active");
}

function subscribeToRoom() {
  closeSubscriptions();
  renderEmpty(els.delegateMessages);
  renderEmpty(els.adminMessages);
  renderEmpty(els.delegateDocuments);
  renderEmpty(els.adminDocuments);

  const messageQuery = query(
    collection(db, "rooms", state.roomId, "messages"),
    orderBy("createdAt", "asc"),
    limit(150)
  );
  const documentQuery = query(
    collection(db, "rooms", state.roomId, "documents"),
    orderBy("createdAt", "desc"),
    limit(80)
  );

  state.unsubscribeMessages = onSnapshot(messageQuery, async (snapshot) => {
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderMessages(items);
  }, (error) => setConnection(readableFirestoreError(error), "warn"));

  state.unsubscribeDocuments = onSnapshot(documentQuery, async (snapshot) => {
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderDocuments(items);
  }, (error) => setConnection(readableFirestoreError(error), "warn"));
}

async function sendMessage(toInput, bodyInput) {
  if (!canUseRoom()) return;

  const plainText = bodyInput.value.trim();
  const to = toInput.value.trim() || "all";
  if (!plainText) return;

  await addDoc(collection(db, "rooms", state.roomId, "messages"), {
    type: "message",
    to,
    body: plainText,
    senderName: displayName(),
    senderRole: state.mode === "admin" ? "Chair" : "Delegate",
    senderId: state.user.uid,
    createdAt: serverTimestamp()
  });

  bodyInput.value = "";
}

function renderMessages(items) {
  renderMessageFeed(els.delegateMessages, items);
  renderMessageFeed(els.adminMessages, items);
}

function renderMessageFeed(target, items) {
  target.replaceChildren();
  if (!items.length) {
    renderEmpty(target);
    return;
  }

  for (const item of items) {
    const article = document.createElement("article");
    article.className = `message${item.senderId === state.user?.uid ? " mine" : ""}`;
    article.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(item.senderName || "Unknown")}</span>
        <span>${escapeHtml(item.senderRole || "")}</span>
        <span>to ${escapeHtml(item.to || "all")}</span>
      </div>
      <p>${escapeHtml(item.body || "")}</p>
    `;
    target.append(article);
  }

  target.scrollTop = target.scrollHeight;
}

function renderDocuments(items) {
  renderDocumentList(els.delegateDocuments, items);
  renderDocumentList(els.adminDocuments, items);
}

function renderDocumentList(target, items) {
  target.replaceChildren();
  if (!items.length) {
    renderEmpty(target);
    return;
  }

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "document";
    article.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(item.title || "Untitled document")}</span>
        <span>${escapeHtml(item.senderName || "Chair")}</span>
      </div>
      <a href="${escapeAttribute(item.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url || "No link")}</a>
      <p>${escapeHtml(item.note || "")}</p>
    `;
    target.append(article);
  }
}

function renderEmpty(target) {
  target.replaceChildren(els.emptyTemplate.content.cloneNode(true));
}

function canUseRoom() {
  if (!state.user || !state.roomId) {
    setConnection("Log in first", "warn");
    return false;
  }
  return true;
}

function closeSubscriptions() {
  if (state.unsubscribeMessages) state.unsubscribeMessages();
  if (state.unsubscribeDocuments) state.unsubscribeDocuments();
  state.unsubscribeMessages = null;
  state.unsubscribeDocuments = null;
}

function restoreLoginState() {
  const saved = JSON.parse(localStorage.getItem("transmun.room") || "null");
  if (!saved) return;
  els.loginEmail.value = saved.email || "";
}

function isAdmin(email) {
  return adminEmails.map((item) => item.toLowerCase()).includes((email || "").toLowerCase());
}

function displayName() {
  return state.user?.email?.split("@")[0] || "Participant";
}

function setConnection(text, tone = "") {
  els.connection.textContent = text;
  els.connection.className = `connection ${tone}`.trim();
}

function setDocumentStatus(text, tone = "") {
  els.documentStatus.textContent = text;
  els.documentStatus.className = `form-status ${tone}`.trim();
}

function readableAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Email or password is incorrect";
  }
  if (code.includes("operation-not-allowed")) {
    return "Enable Email/Password in Firebase Auth";
  }
  return error?.message || "Could not sign in";
}

function readableFirestoreError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) {
    return "Firestore rules blocked this. Publish the latest rules.";
  }
  if (code.includes("failed-precondition")) {
    return "Firestore needs a database/index setup step.";
  }
  return error?.message || "Firestore request failed";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
