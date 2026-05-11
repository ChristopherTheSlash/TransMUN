import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
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
import { firebaseConfig } from "./firebase-config.js";

const state = {
  appReady: false,
  user: null,
  profile: null,
  roomId: "",
  passphrase: "",
  unsubscribeMessages: null,
  unsubscribeDocuments: null
};

const els = {
  connection: document.querySelector("#connection"),
  joinForm: document.querySelector("#join-form"),
  displayName: document.querySelector("#display-name"),
  role: document.querySelector("#role"),
  roomCode: document.querySelector("#room-code"),
  passphrase: document.querySelector("#passphrase"),
  adminMode: document.querySelector("#admin-mode"),
  roomLabel: document.querySelector("#room-label"),
  leaveRoom: document.querySelector("#leave-room"),
  messageForm: document.querySelector("#message-form"),
  messageTo: document.querySelector("#message-to"),
  messageBody: document.querySelector("#message-body"),
  messages: document.querySelector("#messages"),
  documentForm: document.querySelector("#document-form"),
  documentTitle: document.querySelector("#document-title"),
  documentBody: document.querySelector("#document-body"),
  documents: document.querySelector("#documents"),
  emptyTemplate: document.querySelector("#empty-template")
};

const hasConfig = !Object.values(firebaseConfig).some((value) => value.startsWith("PASTE_"));

let db;

if (hasConfig) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    state.appReady = Boolean(user);
    setConnection(user ? "Connected" : "Connecting...", user ? "online" : "");
  });

  signInAnonymously(auth).catch((error) => {
    setConnection(error.message, "warn");
  });
} else {
  setConnection("Add Firebase config", "warn");
}

restoreProfile();
renderEmpty(els.messages);
renderEmpty(els.documents);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab, .view").forEach((node) => node.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.view}-view`).classList.add("active");
  });
});

els.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.appReady) {
    setConnection(hasConfig ? "Firebase is still connecting" : "Add Firebase config", "warn");
    return;
  }

  state.profile = {
    displayName: els.displayName.value.trim(),
    role: els.role.value.trim(),
    adminMode: els.adminMode.checked
  };
  state.roomId = normalizeRoom(els.roomCode.value);
  state.passphrase = els.passphrase.value;
  localStorage.setItem("transmun.profile", JSON.stringify({
    ...state.profile,
    roomId: state.roomId
  }));

  els.roomLabel.textContent = `Room: ${state.roomId}`;
  els.documentForm.classList.toggle("hidden", !state.profile.adminMode);
  subscribeToRoom();
});

els.leaveRoom.addEventListener("click", () => {
  closeSubscriptions();
  state.roomId = "";
  state.passphrase = "";
  els.roomLabel.textContent = "No room joined";
  els.passphrase.value = "";
  els.documentForm.classList.add("hidden");
  renderEmpty(els.messages);
  renderEmpty(els.documents);
});

els.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canWrite()) return;

  const plainText = els.messageBody.value.trim();
  const to = els.messageTo.value.trim() || "all";
  if (!plainText) return;

  await addEncryptedDoc(collection(db, "rooms", state.roomId, "messages"), plainText, {
    type: "message",
    to
  });

  els.messageBody.value = "";
});

els.documentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canWrite()) return;

  const title = els.documentTitle.value.trim();
  const body = els.documentBody.value.trim();
  if (!title || !body) return;

  await addEncryptedDoc(collection(db, "rooms", state.roomId, "documents"), body, {
    type: "document",
    title
  });

  els.documentTitle.value = "";
  els.documentBody.value = "";
});

function subscribeToRoom() {
  closeSubscriptions();
  renderEmpty(els.messages);
  renderEmpty(els.documents);

  const messageQuery = query(
    collection(db, "rooms", state.roomId, "messages"),
    orderBy("createdAt", "asc"),
    limit(120)
  );
  const documentQuery = query(
    collection(db, "rooms", state.roomId, "documents"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  state.unsubscribeMessages = onSnapshot(messageQuery, async (snapshot) => {
    const items = await Promise.all(snapshot.docs.map((doc) => decryptRecord(doc.data(), doc.id)));
    renderMessages(items.filter(Boolean));
  }, (error) => setConnection(error.message, "warn"));

  state.unsubscribeDocuments = onSnapshot(documentQuery, async (snapshot) => {
    const items = await Promise.all(snapshot.docs.map((doc) => decryptRecord(doc.data(), doc.id)));
    renderDocuments(items.filter(Boolean));
  }, (error) => setConnection(error.message, "warn"));
}

async function addEncryptedDoc(targetCollection, plainText, extra) {
  const encrypted = await encryptText(plainText, state.passphrase);
  await addDoc(targetCollection, {
    ...extra,
    ...encrypted,
    senderName: state.profile.displayName,
    senderRole: state.profile.role,
    senderId: state.user.uid,
    createdAt: serverTimestamp()
  });
}

async function decryptRecord(record, id) {
  try {
    const plainText = await decryptText(record, state.passphrase);
    return {
      id,
      ...record,
      plainText
    };
  } catch {
    return {
      id,
      ...record,
      plainText: "[Could not decrypt with this room passphrase]"
    };
  }
}

function renderMessages(items) {
  els.messages.replaceChildren();
  if (!items.length) {
    renderEmpty(els.messages);
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
      <p>${escapeHtml(item.plainText)}</p>
    `;
    els.messages.append(article);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderDocuments(items) {
  els.documents.replaceChildren();
  if (!items.length) {
    renderEmpty(els.documents);
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
      <p>${escapeHtml(item.plainText)}</p>
    `;
    els.documents.append(article);
  }
}

function renderEmpty(target) {
  target.replaceChildren(els.emptyTemplate.content.cloneNode(true));
}

function canWrite() {
  if (!state.appReady || !state.roomId || !state.passphrase) {
    setConnection("Join a room first", "warn");
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

function restoreProfile() {
  const saved = JSON.parse(localStorage.getItem("transmun.profile") || "null");
  if (!saved) return;
  els.displayName.value = saved.displayName || "";
  els.role.value = saved.role || "";
  els.roomCode.value = saved.roomId || "";
  els.adminMode.checked = Boolean(saved.adminMode);
}

function normalizeRoom(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "main";
}

function setConnection(text, tone = "") {
  els.connection.textContent = text;
  els.connection.className = `connection ${tone}`.trim();
}

async function encryptText(plainText, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plainText)
  );

  return {
    cipherText: toBase64(new Uint8Array(cipherBuffer)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    encryption: "AES-GCM/PBKDF2"
  };
}

async function decryptText(record, passphrase) {
  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const cipherText = fromBase64(record.cipherText);
  const key = await deriveKey(passphrase, salt);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherText
  );
  return new TextDecoder().decode(plainBuffer);
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
