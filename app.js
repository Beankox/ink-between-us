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

// ---------- toast + custom confirm (replaces browser alert/confirm) ----------
const toastContainer = $("toast-container");

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast-show"));

  setTimeout(() => {
    toast.classList.remove("toast-show");
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function showConfirm(message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    const modal = $("confirm-modal");
    $("confirm-message").textContent = message;
    $("confirm-ok").textContent = confirmLabel;

    modal.classList.remove("is-hidden");
    modal.classList.remove("confirm-show");
    void modal.offsetWidth;
    modal.classList.add("confirm-show");

    function cleanup(result) {
      modal.classList.remove("confirm-show");
      setTimeout(() => modal.classList.add("is-hidden"), 180);
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onOverlay);
      resolve(result);
    }
    function onOk(){ cleanup(true); }
    function onCancel(){ cleanup(false); }
    function onOverlay(e){ if (e.target === modal) cleanup(false); }

    const okBtn = $("confirm-ok");
    const cancelBtn = $("confirm-cancel");
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onOverlay);
  });
}

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
    showToast(err.message, "error");
  }
});

// ---------- login ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showToast(err.message, "error");
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
  loadNotifications();
  showDaysTogether();
  loadCouplePhoto();
  checkOnThisDay();
  loadQuestTally();
});

// ---------- days together counter (as a level + XP bar) ----------
function showDaysTogether() {
  const el = $("days-together");
  if (typeof siteConfig === "undefined" || !siteConfig.anniversaryDate) {
    el.classList.add("is-hidden");
    return;
  }
  const start = new Date(siteConfig.anniversaryDate + "T00:00:00");
  if (isNaN(start.getTime())) {
    el.classList.add("is-hidden");
    return;
  }
  const days = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    el.classList.add("is-hidden");
    return;
  }

  const DAYS_PER_LEVEL = 30;
  const level = Math.floor(days / DAYS_PER_LEVEL) + 1;
  const progressDays = days % DAYS_PER_LEVEL;
  const progressPct = Math.round((progressDays / DAYS_PER_LEVEL) * 100);

  el.innerHTML = `
    <span class="level-badge">Lv. ${level}</span>${days.toLocaleString()} days together
    <span class="xp-bar-track"><span class="xp-bar-fill" style="width:${progressPct}%"></span></span>
  `;
  el.classList.remove("is-hidden");

  checkMilestone(`days-${Math.floor(days / 100) * 100}`, days >= 100 && days % 100 < 1,
    `🏆 Milestone unlocked: ${Math.floor(days / 100) * 100} days together!`);
}

function checkMilestone(key, condition, message) {
  if (!condition) return;
  const seenKey = `milestone-seen-${key}`;
  if (localStorage.getItem(seenKey)) return;
  localStorage.setItem(seenKey, "1");
  showToast(message, "success");
}

// ---------- quest tally: total poems written together ----------
async function loadQuestTally() {
  const el = $("quest-tally");
  try {
    const snap = await db.collection("poems").where("status", "==", "published").get();
    const count = snap.size;
    if (count === 0) {
      el.classList.add("is-hidden");
      return;
    }
    el.textContent = `📜 ${count} ${count === 1 ? "quest" : "quests"} completed together`;
    el.classList.remove("is-hidden");

    const milestones = [5, 10, 25, 50, 100];
    const hit = milestones.find(m => m === count);
    if (hit) {
      checkMilestone(`poems-${hit}`, true, `🏆 Milestone unlocked: ${hit} poems written together!`);
    }
  } catch (err) {
    console.warn("Couldn't load quest tally:", err);
  }
}

// ---------- couple photo (shown next to the days-together counter) ----------
async function loadCouplePhoto() {
  try {
    const doc = await db.collection("settings").doc("shared").get();
    const data = doc.exists ? doc.data() : null;
    const img = $("couple-photo");
    if (data && data.couplePhoto) {
      img.src = data.couplePhoto;
      img.classList.remove("is-hidden");
    } else {
      img.classList.add("is-hidden");
    }
  } catch (err) {
    console.warn("Couldn't load couple photo:", err);
  }
}

$("couple-photo-btn").addEventListener("click", () => {
  $("couple-photo-input").click();
});

$("couple-photo-input").addEventListener("change", async () => {
  const file = $("couple-photo-input").files[0];
  if (!file) return;
  try {
    showToast("Updating photo…", "info");
    const compressed = await compressImage(file, 500, 0.7);
    await db.collection("settings").doc("shared").set(
      { couplePhoto: compressed },
      { merge: true }
    );
    const img = $("couple-photo");
    img.src = compressed;
    img.classList.remove("is-hidden");
    showToast("Photo updated ✦", "success");
  } catch (err) {
    showToast("Couldn't update photo: " + err.message, "error");
  }
});

// ---------- "on this day" memory ----------
async function checkOnThisDay() {
  const banner = $("memory-banner");
  const bannerText = $("memory-banner-text");
  const today = new Date();

  try {
    const snap = await db.collection("poems")
      .where("status", "==", "published")
      .get();

    const matches = [];
    snap.forEach(docSnap => {
      const p = docSnap.data();
      const d = p.publishedAt?.toDate ? p.publishedAt.toDate() : null;
      if (!d) return;
      const sameDay = d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      const pastYear = d.getFullYear() < today.getFullYear();
      if (sameDay && pastYear) matches.push({ ...p, id: docSnap.id, date: d });
    });

    if (matches.length === 0) {
      banner.classList.add("is-hidden");
      return;
    }
    const pick = matches[0];
    const yearsAgo = today.getFullYear() - pick.date.getFullYear();
    bannerText.textContent = `✦ On this day, ${yearsAgo} year${yearsAgo > 1 ? "s" : ""} ago, ${pick.authorName} wrote "${pick.title || "Untitled"}" for you.`;
    banner.classList.remove("is-hidden");
  } catch (err) {
    console.warn("Couldn't check on-this-day memories:", err);
  }
}

$("memory-banner-close").addEventListener("click", () => {
  $("memory-banner").classList.add("is-hidden");
});

// ---------- dark mode ----------
const darkToggleBtn = $("dark-toggle");
function applyDarkMode(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  darkToggleBtn.textContent = isDark ? "☀️" : "🌙";
}
applyDarkMode(localStorage.getItem("inkBetweenUsDark") === "true");
darkToggleBtn.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark-mode");
  applyDarkMode(isDark);
  localStorage.setItem("inkBetweenUsDark", isDark ? "true" : "false");
});

// ---------- search / filter ----------
let allLoadedPoems = [];
const poemSearchInput = $("poem-search");

poemSearchInput.addEventListener("input", () => {
  renderFilteredPoems();
});

function renderFilteredPoems() {
  const query = poemSearchInput.value.trim().toLowerCase();
  const noResults = $("poems-no-results");
  poemsList.innerHTML = "";

  const filtered = query
    ? allLoadedPoems.filter(p =>
        (p.title || "").toLowerCase().includes(query) ||
        (p.body || "").toLowerCase().includes(query))
    : allLoadedPoems;

  if (filtered.length === 0 && allLoadedPoems.length > 0) {
    noResults.classList.remove("is-hidden");
  } else {
    noResults.classList.add("is-hidden");
  }

  filtered.forEach(p => poemsList.appendChild(renderPoemCard(p)));
}

// ---------- slider ----------
readerToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".reader-toggle-btn");
  if (!btn) return;
  setSelectedAuthor(btn.dataset.author);
});

function setSelectedAuthor(author) {
  const direction =
    (selectedAuthor === "Bea" && author === "Abegail") ? "right" :
    (selectedAuthor === "Abegail" && author === "Bea") ? "left" :
    null;

  selectedAuthor = author;
  document.querySelectorAll(".reader-toggle-btn").forEach(b => {
    b.classList.toggle("is-active", b.dataset.author === author);
  });
  readerThumb.style.transform = author === "Bea" ? "translateX(0)" : "translateX(100%)";
  loadPublishedPoems(direction);
}

// ---------- load published poems for the slider ----------
async function loadPublishedPoems(direction) {
  poemsList.innerHTML = "";
  poemsEmpty.classList.add("is-hidden");
  $("poems-no-results").classList.add("is-hidden");
  poemSearchInput.value = "";
  try {
    const snap = await db.collection("poems")
      .where("authorName", "==", selectedAuthor)
      .where("status", "==", "published")
      .orderBy("publishedAt", "desc")
      .get();

    allLoadedPoems = [];
    if (snap.empty) {
      poemsEmpty.classList.remove("is-hidden");
      animateReaderView(direction);
      return;
    }
    snap.forEach(docSnap => {
      const p = { id: docSnap.id, ...docSnap.data() };
      allLoadedPoems.push(p);
      poemsList.appendChild(renderPoemCard(p));
    });
    animateReaderView(direction);
  } catch (err) {
    poemsEmpty.textContent = "Couldn't load poems: " + err.message;
    poemsEmpty.classList.remove("is-hidden");
  }
}

function animateReaderView(direction) {
  const view = $("reader-view");
  view.classList.remove("slide-in-left", "slide-in-right");
  void view.offsetWidth; // restart the animation even on repeated taps
  if (direction === "right") view.classList.add("slide-in-right");
  else if (direction === "left") view.classList.add("slide-in-left");
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
    ${p.imageData ? `<img class="poem-photo" src="${p.imageData}" alt="" />` : ""}
    <h3 class="poem-title"></h3>
    <p class="poem-meta"></p>
    <p class="poem-body"></p>
    <div class="poem-actions-row">
      <button class="heart-btn" type="button" aria-label="Like this poem">
        <span class="heart-icon">♡</span>
        <span class="heart-count"></span>
      </button>
      <button class="btn btn-ghost comments-toggle-btn" type="button">💬 Comments</button>
      <button class="btn btn-ghost export-btn" type="button">⬇ Export</button>
    </div>
    <div class="poem-comments">
      <div class="comments-section is-hidden">
        <div class="comments-list"></div>
        <form class="comment-form">
          <textarea class="comment-input" rows="2" placeholder="Leave a comment..." required></textarea>
          <button class="btn btn-primary" type="submit">Post</button>
        </form>
      </div>
    </div>
    ${isOwner ? `
      <div class="poem-card-actions">
        <button class="btn btn-secondary poem-edit-btn" type="button">Edit</button>
        <button class="btn btn-danger poem-delete-btn" type="button">Delete</button>
      </div>
    ` : ""}
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

  // ---- export as image ----
  card.querySelector(".export-btn").addEventListener("click", () => exportPoemAsImage(p));

  return card;
}

// ---------- export a poem as a downloadable image ----------
function exportPoemAsImage(p) {
  const width = 800;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // word-wrap the poem body first so we know how tall the canvas needs to be
  ctx.font = "28px Georgia, serif";
  const maxTextWidth = width - 160;
  const words = (p.body || "").split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach(word => {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxTextWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);

  const lineHeight = 42;
  const topPad = 180;
  const bottomPad = 120;
  const height = topPad + lines.length * lineHeight + bottomPad;
  canvas.width = width;
  canvas.height = height;

  // background
  ctx.fillStyle = "#F3EFDE";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#FFFCF3";
  ctx.strokeStyle = "#E2D9BE";
  ctx.lineWidth = 3;
  roundRect(ctx, 20, 20, width - 40, height - 40, 20);
  ctx.fill();
  ctx.stroke();

  // title
  ctx.fillStyle = "#4A4131";
  ctx.font = "bold 40px Georgia, serif";
  ctx.fillText(p.title || "Untitled", 80, 100);

  // meta
  ctx.fillStyle = "#8B806B";
  ctx.font = "20px sans-serif";
  const dateStr = p.publishedAt?.toDate ? p.publishedAt.toDate().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  ctx.fillText(`${p.authorName} · ${dateStr}`, 80, 140);

  // body
  ctx.fillStyle = "#4A4131";
  ctx.font = "28px Georgia, serif";
  lines.forEach((l, i) => {
    ctx.fillText(l, 80, topPad + i * lineHeight);
  });

  // footer mark
  ctx.fillStyle = "#8B806B";
  ctx.font = "italic 18px Georgia, serif";
  ctx.fillText("Ink Between Us", 80, height - 50);

  const link = document.createElement("a");
  link.download = `${(p.title || "poem").replace(/[^a-z0-9]/gi, "_").toLowerCase()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- direct delete from a poem card (no need to open the editor first) ----------
async function deletePoemDirect(poemId) {
  const confirmed = await showConfirm("Delete this poem for good?");
  if (!confirmed) return;
  try {
    await db.collection("poems").doc(poemId).delete();
    showToast("Poem deleted.", "success");
    loadDrafts();
    loadPublishedPoems();
  } catch (err) {
    showToast("Couldn't delete: " + err.message, "error");
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
      createNotification(poem.authorUid, "liked your poem.", poem.title);
    }
  }).catch(err => {
    // revert on failure
    if (isLiked) likedByArr.push(uid);
    else likedByArr.splice(likedByArr.indexOf(uid), 1);
    updateHeartUI(btnEl, likedByArr, uid, false);
    showToast("Couldn't update like: " + err.message, "error");
  });
}

// ---------- notifications (in-app bell) ----------
const notifBell = $("notif-bell");
const notifPanel = $("notif-panel");
const notifBadge = $("notif-badge");
const notifList = $("notif-list");
const notifEmpty = $("notif-empty");
const notifWrap = $("notif-wrap");

let partnerUidCache = null;

async function getPartnerUid() {
  if (partnerUidCache) return partnerUidCache;
  if (!currentProfile || !currentProfile.partnerEmail) return null;
  const snap = await db.collection("users")
    .where("email", "==", currentProfile.partnerEmail)
    .limit(1)
    .get();
  if (snap.empty) return null;
  partnerUidCache = snap.docs[0].id;
  return partnerUidCache;
}

async function createNotification(toUid, message, poemTitle) {
  if (!toUid) return;
  try {
    await db.collection("notifications").add({
      toUid,
      fromUid: currentUser.uid,
      fromName: currentProfile.name,
      message,
      poemTitle: poemTitle || "",
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn("Couldn't create notification:", err);
  }
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

async function loadNotifications() {
  if (!currentUser) return;
  try {
    const snap = await db.collection("notifications")
      .where("toUid", "==", currentUser.uid)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    notifList.innerHTML = "";
    if (snap.empty) {
      notifEmpty.classList.remove("is-hidden");
      updateNotifBadge(0);
      return;
    }
    notifEmpty.classList.add("is-hidden");

    let unreadCount = 0;
    snap.forEach(docSnap => {
      const n = docSnap.data();
      if (!n.read) unreadCount++;
      const row = document.createElement("div");
      row.className = "notif-row" + (n.read ? "" : " notif-unread");
      const date = n.createdAt?.toDate ? n.createdAt.toDate() : null;
      row.innerHTML = `
        <p class="notif-text"><strong></strong> <span class="notif-msg"></span></p>
        <p class="notif-time"></p>
      `;
      row.querySelector("strong").textContent = n.fromName;
      row.querySelector(".notif-msg").textContent = n.message;
      row.querySelector(".notif-time").textContent = date ? timeAgo(date) : "";
      notifList.appendChild(row);
    });
    updateNotifBadge(unreadCount);
  } catch (err) {
    console.warn("Couldn't load notifications:", err);
  }
}

function updateNotifBadge(count) {
  if (count > 0) {
    notifBadge.textContent = count > 9 ? "9+" : count;
    notifBadge.classList.remove("is-hidden");
  } else {
    notifBadge.classList.add("is-hidden");
  }
}

async function markAllNotificationsRead() {
  const snap = await db.collection("notifications")
    .where("toUid", "==", currentUser.uid)
    .where("read", "==", false)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.forEach(docSnap => batch.update(docSnap.ref, { read: true }));
  await batch.commit();
  document.querySelectorAll(".notif-row.notif-unread").forEach(r => r.classList.remove("notif-unread"));
  updateNotifBadge(0);
}

notifBell.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = notifPanel.classList.contains("is-hidden");
  if (isHidden) {
    notifPanel.classList.remove("is-hidden");
    notifPanel.classList.remove("panel-pop-in");
    void notifPanel.offsetWidth;
    notifPanel.classList.add("panel-pop-in");
    markAllNotificationsRead();
  } else {
    notifPanel.classList.add("is-hidden");
  }
});

$("notif-close").addEventListener("click", (e) => {
  e.stopPropagation();
  notifPanel.classList.add("is-hidden");
});

// close the panel when tapping anywhere else on the page
document.addEventListener("click", (e) => {
  if (!notifWrap.contains(e.target)) {
    notifPanel.classList.add("is-hidden");
  }
});

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
      const confirmed = await showConfirm("Delete this comment?");
      if (!confirmed) return;
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
      createNotification(poem.authorUid, "commented on your poem.", poem.title);
    }
  } catch (err) {
    showToast("Couldn't post comment: " + err.message, "error");
  }
}

// ---------- image compression (keeps photos small enough for free Firestore storage) ----------
function compressImage(file, maxDim = 700, startQuality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        let quality = startQuality;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 700000 && quality > 0.2) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

// ---------- editor ----------
$("new-draft-btn").addEventListener("click", () => openEditor(null));
$("close-editor-btn").addEventListener("click", closeEditor);

let editorPhotoData = null;
const editorPhotoInput = $("editor-photo-input");
const editorPhotoPreview = $("editor-photo-preview");
const editorPhotoImg = $("editor-photo-img");

editorPhotoInput.addEventListener("change", async () => {
  const file = editorPhotoInput.files[0];
  if (!file) return;
  try {
    showToast("Adding photo…", "info");
    editorPhotoData = await compressImage(file);
    editorPhotoImg.src = editorPhotoData;
    editorPhotoPreview.classList.remove("is-hidden");
  } catch (err) {
    showToast(err.message, "error");
  }
});

$("editor-photo-remove").addEventListener("click", () => {
  editorPhotoData = null;
  editorPhotoInput.value = "";
  editorPhotoPreview.classList.add("is-hidden");
});

function openEditor(poem) {
  editingPoemId = poem ? poem.id : null;
  editingPoemOriginalStatus = poem ? poem.status : null;
  editorTitle.value = poem ? poem.title : "";
  editorBody.value = poem ? poem.body : "";
  editorStatus.textContent = "";
  $("delete-poem-btn").classList.toggle("is-hidden", !poem);

  editorPhotoData = poem && poem.imageData ? poem.imageData : null;
  editorPhotoInput.value = "";
  if (editorPhotoData) {
    editorPhotoImg.src = editorPhotoData;
    editorPhotoPreview.classList.remove("is-hidden");
  } else {
    editorPhotoPreview.classList.add("is-hidden");
  }

  editor.classList.remove("is-hidden");
  editorTitle.focus();
}

function closeEditor() {
  editor.classList.add("is-hidden");
  editingPoemId = null;
  editingPoemOriginalStatus = null;
  clearTimeout(autoSaveTimer);
}

// ---------- auto-save drafts while typing ----------
let autoSaveTimer = null;
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  if (!editorBody.value.trim()) return; // nothing to save yet
  autoSaveTimer = setTimeout(() => {
    // never auto-save over a poem that's already published — only drafts
    if (editingPoemOriginalStatus === "published") return;
    savePoem("draft", true);
  }, 1500);
}
editorTitle.addEventListener("input", scheduleAutoSave);
editorBody.addEventListener("input", scheduleAutoSave);

$("save-draft-btn").addEventListener("click", () => savePoem("draft"));
$("publish-btn").addEventListener("click", () => savePoem("published"));

async function savePoem(status, silent) {
  const title = editorTitle.value.trim();
  const body = editorBody.value.trim();
  if (!body) {
    if (!silent) editorStatus.textContent = "Write something first.";
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

  if (editorPhotoData) {
    data.imageData = editorPhotoData;
  } else if (editingPoemId) {
    data.imageData = firebase.firestore.FieldValue.delete();
  }

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
      editorStatus.textContent = "";
      showToast("Published! ✦", "success");
      const isFreshPublish = editingPoemOriginalStatus !== "published";
      if (isFreshPublish) {
        await sendNotificationEmail(
          currentProfile.partnerEmail,
          currentProfile.name,
          title,
          `just published a new poem for you.`
        );
        const partnerUid = await getPartnerUid();
        createNotification(partnerUid, "published a new poem for you.", title);
      }
      editingPoemOriginalStatus = "published";
      if (selectedAuthor === currentProfile.name) loadPublishedPoems();
      loadQuestTally();
    } else if (silent) {
      editorStatus.textContent = "Saved ✓";
    } else {
      editorStatus.textContent = "";
      showToast("Draft saved.", "success");
    }
    loadDrafts();
  } catch (err) {
    if (!silent) showToast("Couldn't save: " + err.message, "error");
  }
}

$("delete-poem-btn").addEventListener("click", async () => {
  if (!editingPoemId) return;
  const confirmed = await showConfirm("Delete this poem for good?");
  if (!confirmed) return;
  await db.collection("poems").doc(editingPoemId).delete();
  showToast("Poem deleted.", "success");
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
