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
  const date = p.publishedAt?.toDate ? p.publishedAt.toDate() : null;
  const isMine = currentUser && p.authorUid === currentUser.uid;
  const likedBy = p.likedBy || [];
  const isLiked = currentUser && likedBy.includes(currentUser.uid);
  const likeCount = typeof p.likeCount === "number" ? p.likeCount : likedBy.length;

  card.innerHTML = `
    <h3 class="poem-title"></h3>
    <p class="poem-meta"></p>
    <p class="poem-body"></p>
    <button type="button" class="heart-btn ${isLiked ? "is-liked" : ""}">
      <span class="heart-icon">${isLiked ? "💚" : "🤍"}</span>
      <span class="heart-count">${likeCount}</span>
    </button>
    <div class="poem-comments">
      <button type="button" class="comments-toggle-btn">💬 Comments</button>
      <div class="comments-section is-hidden">
        <div class="comments-list"></div>
        <form class="comment-form">
          <textarea class="comment-input" rows="2" placeholder="Leave a little note…" required></textarea>
          <button type="submit" class="btn btn-secondary">Send</button>
        </form>
      </div>
    </div>
    ${isMine ? `
    <div class="poem-card-actions">
      <button type="button" class="btn btn-secondary poem-edit-btn">✏️ Edit</button>
      <button type="button" class="btn btn-danger poem-delete-btn">🗑️ Delete</button>
    </div>` : ""}
  `;
  card.querySelector(".poem-title").textContent = p.title || "Untitled";
  card.querySelector(".poem-meta").textContent = date
    ? `${p.authorName} · ${date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
    : p.authorName;
  card.querySelector(".poem-body").textContent = p.body || "";

  // ---- heart / like ----
  const heartBtn = card.querySelector(".heart-btn");
  heartBtn.addEventListener("click", () => toggleLike(p, heartBtn));

  // ---- comments (lazy-loaded on first open) ----
  const commentsToggle = card.querySelector(".comments-toggle-btn");
  const commentsSection = card.querySelector(".comments-section");
  const commentsList = card.querySelector(".comments-list");
  let commentsLoaded = false;
  commentsToggle.addEventListener("click", () => {
    commentsSection.classList.toggle("is-hidden");
    if (!commentsSection.classList.contains("is-hidden") && !commentsLoaded) {
      commentsLoaded = true;
      loadComments(p.id, commentsList);
    }
  });

  const commentForm = card.querySelector(".comment-form");
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = commentForm.querySelector(".comment-input");
    const text = input.value.trim();
    if (!text) return;
    await db.collection("poems").doc(p.id).collection("comments").add({
      text,
      authorUid: currentUser.uid,
      authorName: currentProfile.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = "";
    loadComments(p.id, commentsList);
  });

  if (isMine) {
    card.querySelector(".poem-edit-btn").addEventListener("click", () => openEditor(p));
    card.querySelector(".poem-delete-btn").addEventListener("click", async () => {
      if (!confirm("Delete this poem for good? This can't be undone.")) return;
      await db.collection("poems").doc(p.id).delete();
      loadPublishedPoems();
    });
  }
  return card;
}

// ---------- likes ----------
async function toggleLike(p, heartBtn) {
  const ref = db.collection("poems").doc(p.id);
  const likedBy = p.likedBy || [];
  const isLiked = likedBy.includes(currentUser.uid);
  try {
    if (isLiked) {
      await ref.update({
        likedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
        likeCount: firebase.firestore.FieldValue.increment(-1)
      });
      p.likedBy = likedBy.filter(uid => uid !== currentUser.uid);
    } else {
      await ref.update({
        likedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
        likeCount: firebase.firestore.FieldValue.increment(1)
      });
      p.likedBy = [...likedBy, currentUser.uid];
    }
    p.likeCount = p.likedBy.length;
    heartBtn.classList.toggle("is-liked");
    const icon = heartBtn.querySelector(".heart-icon");
    icon.textContent = heartBtn.classList.contains("is-liked") ? "💚" : "🤍";
    heartBtn.querySelector(".heart-count").textContent = p.likeCount;
    icon.classList.remove("heart-pop");
    void icon.offsetWidth;
    icon.classList.add("heart-pop");
  } catch (err) {
    console.warn("Like failed:", err);
  }
}

// ---------- comments ----------
async function loadComments(poemId, container) {
  container.innerHTML = `<p class="comments-empty">Loading…</p>`;
  try {
    const snap = await db.collection("poems").doc(poemId).collection("comments")
      .orderBy("createdAt", "asc").get();
    container.innerHTML = "";
    if (snap.empty) {
      container.innerHTML = `<p class="comments-empty">No notes yet — be the first to leave one.</p>`;
      return;
    }
    snap.forEach(docSnap => {
      const c = { id: docSnap.id, ...docSnap.data() };
      const row = document.createElement("div");
      row.className = "comment-row";
      row.innerHTML = `<p class="comment-author"></p><p class="comment-text"></p>`;
      row.querySelector(".comment-author").textContent = c.authorName || "Someone";
      row.querySelector(".comment-text").textContent = c.text || "";
      if (currentUser && c.authorUid === currentUser.uid) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-ghost comment-delete-btn";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", async () => {
          await db.collection("poems").doc(poemId).collection("comments").doc(c.id).delete();
          loadComments(poemId, container);
        });
        row.appendChild(delBtn);
      }
      container.appendChild(row);
    });
  } catch (err) {
    container.innerHTML = `<p class="comments-empty">Couldn't load comments: ${err.message}</p>`;
  }
}

// ---------- editor ----------
$("new-draft-btn").addEventListener("click", () => openEditor(null));
$("close-editor-btn").addEventListener("click", closeEditor);

function openEditor(poem) {
  editingPoemId = poem ? poem.id : null;
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
    data.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
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
      await notifyPartner(title);
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
async function notifyPartner(title) {
  if (typeof emailjs === "undefined" || emailjsConfig.publicKey === "PASTE_ME") return;
  if (!currentProfile.partnerEmail) return;
  try {
    await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
      to_email: currentProfile.partnerEmail,
      from_name: currentProfile.name,
      poem_title: title || "Untitled",
    });
  } catch (err) {
    console.warn("Notification email failed:", err);
  }
}
