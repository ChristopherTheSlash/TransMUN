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
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { accounts as defaultAccounts, firebaseConfig } from "./firebase-config.js";

const state = {
  authReady: false,
  user: null,
  account: null,
  mode: "delegate",
  roomId: "main",
  accounts: [...defaultAccounts],
  unsubscribeMessages: null,
  unsubscribeDocuments: null,
  unsubscribeAccounts: null
};

const els = {
  connection: document.querySelector("#connection"),
  signOut: document.querySelector("#sign-out"),
  pageTitle: document.querySelector("#page-title"),
  loginPage: document.querySelector("#login-page"),
  delegatePage: document.querySelector("#delegate-page"),
  adminPage: document.querySelector("#admin-page"),
  loginForm: document.querySelector("#login-form"),
  loginAccount: document.querySelector("#login-account"),
  loginPassword: document.querySelector("#login-password"),
  delegateRoom: document.querySelector("#delegate-room"),
  adminRoom: document.querySelector("#admin-room"),
  delegateMessages: document.querySelector("#delegate-messages-feed"),
  adminMessages: document.querySelector("#admin-messages-feed"),
  screeningFeed: document.querySelector("#screening-feed"),
  delegateMessageForm: document.querySelector("#delegate-message-form"),
  delegateMessageTo: document.querySelector("#delegate-message-to"),
  delegateMessageBody: document.querySelector("#delegate-message-body"),
  delegateMessageStatus: document.querySelector("#delegate-message-status"),
  adminMessageForm: document.querySelector("#admin-message-form"),
  adminMessageTo: document.querySelector("#admin-message-to"),
  adminMessageBody: document.querySelector("#admin-message-body"),
  adminMessageStatus: document.querySelector("#admin-message-status"),
  delegateDocuments: document.querySelector("#delegate-documents"),
  adminDocuments: document.querySelector("#admin-documents-list"),
  documentForm: document.querySelector("#document-link-form"),
  documentTitle: document.querySelector("#document-title"),
  documentUrl: document.querySelector("#document-url"),
  documentNote: document.querySelector("#document-note"),
  documentStatus: document.querySelector("#document-status"),
  personForm: document.querySelector("#person-form"),
  personLabel: document.querySelector("#person-label"),
  personAccount: document.querySelector("#person-account"),
  personPassword: document.querySelector("#person-password"),
  personRole: document.querySelector("#person-role"),
  personStatus: document.querySelector("#person-status"),
  peopleList: document.querySelector("#people-list"),
  emptyTemplate: document.querySelector("#empty-template")
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, (user) => {
  state.authReady = true;
  state.user = user;
  if (user) {
    const account = state.accounts.find((item) => item.authEmail === user.email);
    if (account) {
      state.account = account;
      state.mode = account.role === "chair" ? "admin" : "delegate";
      setConnection(account.label, "online");
      subscribeAccounts();
      openWorkspace();
      return;
    }
  }
  setConnection("Ready", "");
  showPage("login");
});

restoreLoginState();
renderEmpty(els.delegateMessages);
renderEmpty(els.adminMessages);
renderEmpty(els.screeningFeed);
renderEmpty(els.delegateDocuments);
renderEmpty(els.adminDocuments);
renderEmpty(els.peopleList);
populateRecipientPickers();

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab));
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.authReady) {
    setConnection("Firebase is still connecting", "warn");
    return;
  }

  const account = findAccount(els.loginAccount.value);
  if (!account) {
    setConnection("Account or password is incorrect", "warn");
    return;
  }

  try {
    setConnection("Signing in...", "");
    await signInWithEmailAndPassword(auth, account.authEmail, els.loginPassword.value);
    localStorage.setItem("transmun.account", account.account);
    els.loginPassword.value = "";
  } catch (error) {
    setConnection(readableAuthError(error), "warn");
  }
});

els.signOut.addEventListener("click", async () => {
  closeRoomSubscriptions();
  state.account = null;
  state.mode = "delegate";
  localStorage.removeItem("transmun.account");
  await signOut(auth);
});

els.delegateMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage(els.delegateMessageTo, els.delegateMessageBody, els.delegateMessageStatus);
});

els.adminMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage(els.adminMessageTo, els.adminMessageBody, els.adminMessageStatus);
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
      senderAccount: state.account.account,
      senderName: state.account.label,
      senderRole: "Chair",
      createdAt: serverTimestamp()
    });
    els.documentTitle.value = "";
    els.documentUrl.value = "";
    els.documentNote.value = "";
    setDocumentStatus("Document link posted.");
  } catch (error) {
    showFirestoreError(error, setDocumentStatus);
  } finally {
    button.disabled = false;
  }
});

els.personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canUseRoom() || state.mode !== "admin") return;

  const label = els.personLabel.value.trim();
  const account = normalizeAccount(els.personAccount.value);
  const role = els.personRole.value;
  if (!label || !account) return;

  const button = els.personForm.querySelector("button");
  button.disabled = true;
  setPersonStatus("Adding account...");

  try {
    await addDoc(collection(db, "rooms", state.roomId, "accounts"), {
      account,
      authEmail: `${account.toLowerCase()}@transmun.invalid`,
      label,
      role,
      createdBy: state.account.account,
      createdAt: serverTimestamp()
    });
    els.personLabel.value = "";
    els.personAccount.value = "";
    els.personPassword.value = "";
    els.personRole.value = "delegate";
    setPersonStatus("Account added.");
  } catch (error) {
    showFirestoreError(error, setPersonStatus);
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
  els.pageTitle.textContent = page === "admin"
    ? "Admin panel"
    : page === "delegate"
      ? "Delegate workspace"
      : "Delegate and chair portal";
}

function switchTab(tab) {
  const scope = tab.dataset.scope;
  document.querySelectorAll(`.tab[data-scope="${scope}"]`).forEach((node) => node.classList.remove("active"));
  tab.classList.add("active");

  const page = scope === "admin" ? els.adminPage : els.delegatePage;
  page.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${tab.dataset.view}`).classList.add("active");
}

function subscribeAccounts() {
  if (state.unsubscribeAccounts) return;
  const accountQuery = query(
    collection(db, "rooms", state.roomId, "accounts"),
    orderBy("label", "asc"),
    limit(200)
  );
  state.unsubscribeAccounts = onSnapshot(accountQuery, (snapshot) => {
    const remoteAccounts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.accounts = mergeAccounts(defaultAccounts, remoteAccounts);
    populateRecipientPickers();
    renderPeople(state.accounts);
  }, (error) => setConnection(readableFirestoreError(error), "warn"));
}

function subscribeToRoom() {
  closeRoomSubscriptions();
  renderEmpty(els.delegateMessages);
  renderEmpty(els.adminMessages);
  renderEmpty(els.screeningFeed);
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

  state.unsubscribeMessages = onSnapshot(messageQuery, (snapshot) => {
    renderMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, (error) => setConnection(readableFirestoreError(error), "warn"));

  state.unsubscribeDocuments = onSnapshot(documentQuery, (snapshot) => {
    renderDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, (error) => setConnection(readableFirestoreError(error), "warn"));
}

async function sendMessage(toInput, bodyInput, statusTarget) {
  if (!canUseRoom()) return;

  const plainText = bodyInput.value.trim();
  const recipients = selectedRecipients(toInput);
  if (!plainText || !recipients.length) return;

  if (recipients.length > 3) {
    setFormStatus(statusTarget, "Choose at most three recipients.", "warn");
    return;
  }

  const isChairMessage = state.mode === "admin";
  try {
    await addDoc(collection(db, "rooms", state.roomId, "messages"), {
      type: "message",
      status: isChairMessage ? "approved" : "pending",
      to: recipients.map((recipient) => recipient.label).join(", "),
      recipientAccounts: recipients.map((recipient) => recipient.account),
      recipientLabels: recipients.map((recipient) => recipient.label),
      body: plainText,
      chairNote: "",
      senderAccount: state.account.account,
      senderName: state.account.label,
      senderRole: isChairMessage ? "Chair" : "Delegate",
      createdAt: serverTimestamp()
    });
    bodyInput.value = "";
    clearSelection(toInput);
    setFormStatus(statusTarget, isChairMessage ? "Message delivered." : "Message sent to chair screening.");
  } catch (error) {
    showFirestoreError(error, (text, tone) => setFormStatus(statusTarget, text, tone));
  }
}

function renderMessages(items) {
  const pending = items.filter((item) => item.status === "pending");
  const adminHistory = items.filter((item) => item.status !== "pending");
  const delegateItems = items.filter((item) => isVisibleToCurrentDelegate(item));
  renderMessageFeed(els.delegateMessages, delegateItems, { moderation: false });
  renderMessageFeed(els.adminMessages, adminHistory, { moderation: false });
  renderMessageFeed(els.screeningFeed, pending, { moderation: true });
}

function renderMessageFeed(target, items, options) {
  target.replaceChildren();
  if (!items.length) {
    renderEmpty(target);
    return;
  }
  for (const item of items) {
    const article = document.createElement("article");
    article.className = `message${item.senderAccount === state.account?.account ? " mine" : ""}`;
    article.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(item.senderName || "Unknown")}</span>
        <span>${escapeHtml(item.senderRole || "")}</span>
        <span>to ${escapeHtml(item.to || "all")}</span>
        <span>${escapeHtml(messageStatusLabel(item))}</span>
      </div>
      <p>${escapeHtml(item.body || "")}</p>
    `;
    if (item.status === "returned" && item.chairNote) {
      const note = document.createElement("p");
      note.className = "chair-note";
      note.textContent = `Chair note: ${item.chairNote}`;
      article.append(note);
    }
    if (options.moderation) article.append(createModerationControls(item));
    target.append(article);
  }
  target.scrollTop = target.scrollHeight;
}

function createModerationControls(item) {
  const wrapper = document.createElement("form");
  wrapper.className = "moderation-controls";
  wrapper.innerHTML = `
    <textarea rows="2" maxlength="600" placeholder="Return note, if needed"></textarea>
    <div class="button-row">
      <button type="button" data-action="approve">Approve</button>
      <button type="button" class="secondary" data-action="return">Return</button>
    </div>
  `;
  wrapper.querySelector('[data-action="approve"]').addEventListener("click", () => screenMessage(item, "approved", ""));
  wrapper.querySelector('[data-action="return"]').addEventListener("click", () => {
    const note = wrapper.querySelector("textarea").value.trim();
    if (!note) {
      setConnection("Add a return note first", "warn");
      return;
    }
    screenMessage(item, "returned", note);
  });
  return wrapper;
}

async function screenMessage(item, status, chairNote) {
  try {
    await updateDoc(doc(db, "rooms", state.roomId, "messages", item.id), {
      status,
      chairNote,
      screenedBy: state.account.account,
      screenedAt: serverTimestamp()
    });
    setConnection(status === "approved" ? "Message approved" : "Message returned", "online");
  } catch (error) {
    setConnection(readableFirestoreError(error), "warn");
  }
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
  if (!state.user || !state.account) {
    setConnection("Log in first", "warn");
    return false;
  }
  return true;
}

function populateRecipientPickers() {
  renderRecipientOptions(els.delegateMessageTo, { includeChair: true, includeDelegates: true });
  renderRecipientOptions(els.adminMessageTo, { includeChair: false, includeDelegates: true });
}

function renderRecipientOptions(select, options) {
  select.replaceChildren();
  const currentAccount = state.account?.account || "";
  const filtered = state.accounts.filter((account) => {
    if (!options.includeChair && account.role === "chair") return false;
    if (!options.includeDelegates && account.role !== "chair") return false;
    return account.account !== currentAccount;
  });
  if (!filtered.length) {
    const option = document.createElement("option");
    option.textContent = "No recipients available yet";
    option.disabled = true;
    select.append(option);
    return;
  }
  for (const account of filtered) {
    const option = document.createElement("option");
    option.value = account.account;
    option.textContent = account.label;
    option.dataset.label = account.label;
    option.dataset.role = account.role;
    select.append(option);
  }
}

function selectedRecipients(select) {
  return Array.from(select.selectedOptions).filter((option) => !option.disabled).map((option) => ({
    account: option.value,
    label: option.dataset.label || option.textContent
  }));
}

function clearSelection(select) {
  Array.from(select.options).forEach((option) => {
    option.selected = false;
  });
}

function isVisibleToCurrentDelegate(item) {
  const account = state.account?.account || "";
  if (item.senderAccount === account) return true;
  if (item.status !== "approved") return false;
  return Array.isArray(item.recipientAccounts) && item.recipientAccounts.includes(account);
}

function messageStatusLabel(item) {
  if (item.status === "approved") return "delivered";
  if (item.status === "returned") return "returned";
  return "pending chair review";
}

function closeRoomSubscriptions() {
  if (state.unsubscribeMessages) state.unsubscribeMessages();
  if (state.unsubscribeDocuments) state.unsubscribeDocuments();
  state.unsubscribeMessages = null;
  state.unsubscribeDocuments = null;
}

function restoreLoginState() {
  const savedAccount = localStorage.getItem("transmun.account");
  if (savedAccount) els.loginAccount.value = savedAccount;
}

function findAccount(value) {
  const normalized = normalizeAccount(value);
  return state.accounts.find((account) => normalizeAccount(account.account) === normalized);
}

function displayName() {
  return state.account?.label || "Participant";
}

function mergeAccounts(fallback, remote) {
  const merged = new Map();
  for (const account of [...fallback, ...remote]) {
    const key = normalizeAccount(account.account || "");
    if (!key) continue;
    merged.set(key, {
      account: key,
      authEmail: account.authEmail || `${key.toLowerCase()}@transmun.invalid`,
      label: account.label || key,
      role: account.role === "chair" ? "chair" : "delegate"
    });
  }
  return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function renderPeople(items) {
  els.peopleList.replaceChildren();
  if (!items.length) {
    renderEmpty(els.peopleList);
    return;
  }
  for (const item of items) {
    const row = document.createElement("article");
    row.className = "person-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <p>${escapeHtml(item.account)}</p>
      </div>
      <span>${escapeHtml(item.role)}</span>
    `;
    els.peopleList.append(row);
  }
}

function normalizeAccount(value) {
  return String(value).trim().toLowerCase();
}

function setConnection(text, tone = "") {
  els.connection.textContent = text;
  els.connection.className = `connection ${tone}`.trim();
}

function setDocumentStatus(text, tone = "") {
  els.documentStatus.textContent = text;
  els.documentStatus.className = `form-status ${tone}`.trim();
}

function setPersonStatus(text, tone = "") {
  els.personStatus.textContent = text;
  els.personStatus.className = `form-status ${tone}`.trim();
}

function setFormStatus(target, text, tone = "") {
  target.textContent = text;
  target.className = `form-status ${tone}`.trim();
}

function showFirestoreError(error, setter) {
  const message = readableFirestoreError(error);
  setter(message, "warn");
  setConnection(message, "warn");
}

function readableFirestoreError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Firestore rules blocked this. Publish the latest rules.";
  if (code.includes("failed-precondition")) return "Firestore needs a database/index setup step.";
  return error?.message || "Firestore request failed";
}

function readableAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Account or password is incorrect";
  }
  if (code.includes("operation-not-allowed")) {
    return "Enable Email/Password in Firebase Auth.";
  }
  return error?.message || "Could not sign in";
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
