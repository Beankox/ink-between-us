/* Ink Between Us — app logic
   Vanilla JS, Firebase compat SDK, EmailJS for notification emails. */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
if (typeof emailjs !== "undefined" && emailjsConfig.publicKey !== "PASTE_ME") {
  emailjs.init({ publicKey: emailjsConfig.publicKey });
}

// ---------- state ----------
let currentUser = null;   // firebase auth user
let currentProfile = null; // { name, email, partnerEmail }
let selectedAuthor = "Bea";
let editingPoemId = null; // null = new poem
let editingPoemOriginalStatus = null; // tracks whether we're editing an already-published poem

// ---------- element refs ----------
const $ = (id) => document.getElementById(id);

const authScreen = $("auth-screen");
const appScreen = $("app-screen");

const loginForm = $("login-form");
const signupForm = $("signup-form");
const authTabs = document.querySelectorAll(".auth-tab");

const readerToggle = $("reader-toggle");
const readerThumb = $("reader-thumb");
const poemsList = $("poems-list");
const poemsEmpty = $("poems-empty");

const editor = $("editor");
const editorTitle = $("editor-title");
const editorBody = $("editor-body");
const editorStatus = $("editor-status");
const draftsList = $("drafts-list");
const draftsEmpty = $("drafts-empty");

// ---------- auth tab switching ----------
authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    authTabs.forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const isLogin = tab.dataset.tab === "login";
    loginForm.classList.toggle("is-hidden", !isLogin);
    signupForm.classList.toggle("is-hidden", isLogin);
  });
});

// ---------- signup ----------
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("signup-error").textContent = "";
  const name = $("signup-name").value;
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const partnerEmail = $("signup-partner-email").value.trim().toLowerCase();

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name,
      email: email.toLowerCase(),
      partnerEmail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    $("signup-error").textContent = err.message;
  }
});

// ---------- login ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    $("login-error").textContent = err.message;
  }
});

$("logout-btn").addEventListener("click", () => auth.signOut());

// ---------- auth state ----------
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (!user) {
    currentProfile = null;
    authScreen.classList.remove("is-hidden");
    appScreen.classList.add("is-hidden");
    return;
  }
  const doc = await db.collection("users").doc(user.uid).get();
  currentProfile = doc.exists ? doc.data() : null;
  if (!currentProfile) return; // profile still being created

  authScreen.classList.add("is-hidden");
  appScreen.classList.remove("is-hidden");
  $("whoami").textContent = `Signed in as ${currentProfile.name}`;

  // default the slider to the OTHER person's poems — that's usually what you open the page for
  const otherAuthor = currentProfile.name === "Bea" ? "Abegail" : "Bea";
  setSelectedAuthor(otherAuthor);
  loadDrafts();
});

// ---------- slider ----------
readerToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".reader-toggle-btn");
  if (!btn) return;
  setSelectedAuthor(btn.dataset.author);
});

function setSelectedAuthor(author) {
  selectedAuthor = author;
  document.querySelectorAll(".reader-toggle-btn").forEach(b => {
    b.classList.toggle("is-active", b.dataset.author === author);
  });
  readerThumb.style.transform = author === "Bea" ? "translateX(0)" : "translateX(100%)";
  loadPublishedPoems();
}

// ---------- load published poems for the slider ----------
async function loadPublishedPoems() {
  poemsList.innerHTML = "";
  poemsEmpty.classList.add("is-hidden");
  try {
    const snap = await db.collection("poems")
      .where("authorName", "==", selectedAuthor)
      .where("status", "==", "published")
      .orderBy("publishedAt", "desc")
      .get();

    if (snap.empty) {
      poemsEmpty.classList.remove("is-hidden");
      return;
    }
    snap.forEach(docSnap => {
      const p = { id: docSnap.id, ...docSnap.data() };
      poemsList.appendChild(renderPoemCard(p));
    });
  } catch (err) {
    poemsEmpty.textContent = "Couldn't load poems: " + err.message;
    poemsEmpty.classList.remove("is-hidden");
  }
}

function renderPoemCard(p) {
  const card = document.createElement("article");
  card.className = "poem-card";
  const isOwner = currentProfile && p.authorName === currentProfile.name;
  if (isOwner) card.classList.add("poem-card-owned");

  const publishedDate = p.publishedAt?.toDate ? p.publishedAt.toDate() : null;
  const editedDate = p.editedAt?.toDate ? p.editedAt.toDate() : null;

  const fmt = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  let metaText = p.authorName;
  if (publishedDate) {
    metaText += ` · ${fmt(publishedDate)}`;
    if (editedDate) {
      metaText += ` - Edited on ${fmt(editedDate)}`;
    }
  }

  card.innerHTML = `
    <h3 class="poem-title"></h3>
    <p class="poem-meta"></p>
    <p class="poem-body"></p>
    <button class="heart-btn" type="button" aria-label="Like this poem">
      <span class="heart-icon">♡</span>
      <span class="heart-count"></span>
    </button>
    ${isOwner ? `
      <div class="poem-card-actions">
        <button class="btn btn-ghost poem-edit-btn" type="button">Edit</button>
        <button class="btn btn-ghost poem-delete-btn" type="button">Delete</button>
      </div>
    ` : ""}
    <div class="poem-comments">
      <button class="btn btn-ghost comments-toggle-btn" type="button">💬 Comments</button>
      <div class="comments-section is-hidden">
        <div class="comments-list"></div>
        <form class="comment-form">
          <textarea class="comment-input" rows="2" placeholder="Leave a comment..." required></textarea>
          <button class="btn btn-primary" type="submit">Post</button>
        </form>
      </div>
    </div>
  `;
  card.querySelector(".poem-title").textContent = p.title || "Untitled";
  card.querySelector(".poem-meta").textContent = metaText;
  card.querySelector(".poem-body").textContent = p.body || "";

  // ---- heart / like wiring ----
  const likedBy = p.likedBy ? [...p.likedBy] : []; // local mutable copy for optimistic UI
  const heartBtn = card.querySelector(".heart-btn");
  updateHeartUI(heartBtn, likedBy, currentUser ? currentUser.uid : null);
  heartBtn.addEventListener("click", () => toggleLike(p, likedBy, heartBtn));

  if (isOwner) {
    card.querySelector(".poem-edit-btn").addEventListener("click", () => openEditor(p));
    card.querySelector(".poem-delete-btn").addEventListener("click", () => deletePoemDirect(p.id));
  }

  // ---- comments wiring ----
  const commentsToggleBtn = card.querySelector(".comments-toggle-btn");
  const commentsSection = card.querySelector(".comments-section");
  const commentsList = card.querySelector(".comments-list");
  const commentForm = card.querySelector(".comment-form");
  const commentInput = card.querySelector(".comment-input");
  let commentsLoaded = false;

  commentsToggleBtn.addEventListener("click", () => {
    commentsSection.classList.toggle("is-hidden");
    if (!commentsSection.classList.contains("is-hidden") && !commentsLoaded) {
      commentsLoaded = true;
      loadComments(p.id, commentsList);
    }
  });

  commentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addComment(p, commentInput.value, commentsList, commentForm);
  });

  return card;
}

// ---------- direct delete from a poem card (no need to open the editor first) ----------
async function deletePoemDirect(poemId) {
  if (!confirm("Delete this poem for good?")) return;
  try {
    await db.collection("poems").doc(poemId).delete();
    loadDrafts();
    loadPublishedPoems();
  } catch (err) {
    alert("Couldn't delete: " + err.message);
  }
}

// ---------- heart / like ----------
function updateHeartUI(btnEl, likedByArr, uid, animate) {
  const isLiked = !!(uid && likedByArr.includes(uid));
  btnEl.classList.toggle("is-liked", isLiked);
  const iconEl = btnEl.querySelector(".heart-icon");
  iconEl.textContent = isLiked ? "♥" : "♡";
  const countEl = btnEl.querySelector(".heart-count");
  countEl.textContent = likedByArr.length > 0 ? likedByArr.length : "";

  if (animate) {
    iconEl.classList.remove("heart-pop");
    void iconEl.offsetWidth; // restart the animation even if clicked twice quickly
    iconEl.classList.add("heart-pop");
  }
}

function toggleLike(poem, likedByArr, btnEl) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const idx = likedByArr.indexOf(uid);
  const isLiked = idx !== -1;

  // optimistic update — feels instant, we correct it below if the save fails
  if (isLiked) likedByArr.splice(idx, 1);
  else likedByArr.push(uid);
  updateHeartUI(btnEl, likedByArr, uid, true);

  db.collection("poems").doc(poem.id).update({
    likedBy: isLiked
      ? firebase.firestore.FieldValue.arrayRemove(uid)
      : firebase.firestore.FieldValue.arrayUnion(uid)
  }).then(() => {
    // only notify on a fresh like (not on unlike), and not when liking your own poem
    const justLiked = !isLiked;
    if (justLiked && poem.authorUid !== uid) {
      sendNotificationEmail(
        poem.authorEmail,
        currentProfile.name,
        poem.title,
        `liked your poem.`
      );
    }
  }).catch(err => {
    // revert on failure
    if (isLiked) likedByArr.push(uid);
    else likedByArr.splice(likedByArr.indexOf(uid), 1);
    updateHeartUI(btnEl, likedByArr, uid, false);
    alert("Couldn't update like: " + err.message);
  });
}

// ---------- comments ----------
async function loadComments(poemId, listEl) {
  listEl.innerHTML = '<p class="comments-empty">Loading...</p>';
  try {
    const snap = await db.collection("poems").doc(poemId)
      .collection("comments").orderBy("createdAt", "asc").get();

    listEl.innerHTML = "";
    if (snap.empty) {
      listEl.innerHTML = '<p class="comments-empty">No comments yet.</p>';
      return;
    }
    snap.forEach(docSnap => {
      const c = { id: docSnap.id, ...docSnap.data() };
      listEl.appendChild(renderCommentRow(c, poemId));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="comments-empty">Couldn't load comments: ${err.message}</p>`;
  }
}

function renderCommentRow(c, poemId) {
  const row = document.createElement("div");
  row.className = "comment-row";
  const date = c.createdAt?.toDate ? c.createdAt.toDate() : null;
  const isMine = currentUser && c.authorUid === currentUser.uid;

  row.innerHTML = `
    <p class="comment-author"></p>
    <p class="comment-text"></p>
    ${isMine ? '<button class="btn btn-ghost comment-delete-btn" type="button">Delete</button>' : ""}
  `;
  row.querySelector(".comment-author").textContent = date
    ? `${c.authorName} · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : c.authorName;
  row.querySelector(".comment-text").textContent = c.text;

  if (isMine) {
    row.querySelector(".comment-delete-btn").addEventListener("click", async () => {
      if (!confirm("Delete this comment?")) return;
      await db.collection("poems").doc(poemId).collection("comments").doc(c.id).delete();
      row.remove();
    });
  }
  return row;
}

async function addComment(poem, text, listEl, formEl) {
  if (!text.trim()) return;
  try {
    await db.collection("poems").doc(poem.id).collection("comments").add({
      text: text.trim(),
      authorName: currentProfile.name,
      authorUid: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    formEl.reset();
    loadComments(poem.id, listEl);

    // notify the poem's author, unless they're commenting on their own poem
    if (poem.authorUid !== currentUser.uid) {
      await sendNotificationEmail(
        poem.authorEmail,
        currentProfile.name,
        poem.title,
        `commented on your poem.`
      );
    }
  } catch (err) {
    alert("Couldn't post comment: " + err.message);
  }
}

// ---------- editor ----------
$("new-draft-btn").addEventListener("click", () => openEditor(null));
$("close-editor-btn").addEventListener("click", closeEditor);

function openEditor(poem) {
  editingPoemId = poem ? poem.id : null;
  editingPoemOriginalStatus = poem ? poem.status : null;
  editorTitle.value = poem ? poem.title : "";
  editorBody.value = poem ? poem.body : "";
  editorStatus.textContent = "";
  $("delete-poem-btn").classList.toggle("is-hidden", !poem);
  editor.classList.remove("is-hidden");
  editorTitle.focus();
}

function closeEditor() {
  editor.classList.add("is-hidden");
  editingPoemId = null;
  editingPoemOriginalStatus = null;
}

$("save-draft-btn").addEventListener("click", () => savePoem("draft"));
$("publish-btn").addEventListener("click", () => savePoem("published"));

async function savePoem(status) {
  const title = editorTitle.value.trim();
  const body = editorBody.value.trim();
  if (!body) {
    editorStatus.textContent = "Write something first.";
    return;
  }

  const data = {
    title,
    body,
    status,
    authorUid: currentUser.uid,
    authorName: currentProfile.name,
    authorEmail: currentProfile.email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (status === "published") {
    const wasAlreadyPublished = editingPoemOriginalStatus === "published";
    if (wasAlreadyPublished) {
      data.editedAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
      data.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
  }

  try {
    if (editingPoemId) {
      await db.collection("poems").doc(editingPoemId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection("poems").add(data);
      editingPoemId = ref.id;
    }

    if (status === "published") {
      editorStatus.textContent = "Published.";
      const isFreshPublish = editingPoemOriginalStatus !== "published";
      if (isFreshPublish) {
        await sendNotificationEmail(
          currentProfile.partnerEmail,
          currentProfile.name,
          title,
          `just published a new poem for you.`
        );
      }
      editingPoemOriginalStatus = "published";
      if (selectedAuthor === currentProfile.name) loadPublishedPoems();
    } else {
      editorStatus.textContent = "Draft saved.";
    }
    loadDrafts();
  } catch (err) {
    editorStatus.textContent = "Couldn't save: " + err.message;
  }
}

$("delete-poem-btn").addEventListener("click", async () => {
  if (!editingPoemId) return;
  if (!confirm("Delete this poem for good?")) return;
  await db.collection("poems").doc(editingPoemId).delete();
  closeEditor();
  loadDrafts();
  loadPublishedPoems();
});

// ---------- drafts list ----------
async function loadDrafts() {
  draftsList.innerHTML = "";
  draftsEmpty.classList.add("is-hidden");
  const snap = await db.collection("poems")
    .where("authorUid", "==", currentUser.uid)
    .where("status", "==", "draft")
    .orderBy("updatedAt", "desc")
    .get();

  if (snap.empty) {
    draftsEmpty.classList.remove("is-hidden");
    return;
  }
  snap.forEach(docSnap => {
    const p = { id: docSnap.id, ...docSnap.data() };
    const row = document.createElement("div");
    row.className = "draft-row";
    row.innerHTML = `
      <span class="draft-row-title ${p.title ? "" : "untitled"}"></span>
      <button class="btn btn-ghost">Open</button>
    `;
    row.querySelector(".draft-row-title").textContent = p.title || "Untitled draft";
    row.querySelector("button").addEventListener("click", () => openEditor(p));
    draftsList.appendChild(row);
  });
}

// ---------- notification email ----------
async function sendNotificationEmail(toEmail, fromName, poemTitle, message) {
  if (typeof emailjs === "undefined" || emailjsConfig.publicKey === "PASTE_ME") return;
  if (!toEmail) return;
  try {
    await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
      to_email: toEmail,
      from_name: fromName,
      poem_title: poemTitle || "Untitled",
      message: message
    });
  } catch (err) {
    console.warn("Notification email failed:", err);
  }
}
