# Ink Between Us

A small private site for two people to write poems for each other — with drafts,
a toggle to read "Bea's poems" or "Abegail's poems", and an email the moment
one of you publishes something new.

It's plain HTML/CSS/JS, no build step. It uses two free services to do the
heavy lifting:
- **Firebase** — accounts + the database that stores the poems
- **EmailJS** — sends the "new poem for you" email

You only ever need to edit **one file**: `js/config.js`. Everything below is
how to get the values that go in it. It looks like a lot of steps but it's all
clicking buttons on two websites, no code — should take about 15–20 minutes.

---

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, name it something like `ink-between-us`, and finish the wizard (you can turn off Google Analytics, you don't need it).
3. In the left sidebar go to **Build → Authentication → Get started**. Under **Sign-in method**, enable **Email/Password**.
4. Go to **Build → Firestore Database → Create database**. Start in **production mode**, pick any region.
5. Once it's created, go to the **Rules** tab of Firestore, delete what's there, and paste in the contents of `firestore.rules` from this folder. Click **Publish**.
6. Go to **Project settings** (gear icon, top left) → scroll to **Your apps** → click the **</>** (web) icon → give it a nickname → **Register app**. Firebase will show you a `firebaseConfig` object with keys like `apiKey`, `authDomain`, etc.
7. Copy those values into `js/config.js`, in the `firebaseConfig` block.

## 2. Set up EmailJS (the notification email)

1. Go to [emailjs.com](https://www.emailjs.com) and create a free account.
2. **Email Services** → **Add New Service** → connect the email account you want the notifications to be sent *from* (Gmail works fine). Note the **Service ID**.
3. **Email Templates** → **Create New Template**. Set it up like this:
   - To email: `{{to_email}}`
   - Subject: something like `{{from_name}} just published a poem for you`
   - Body, e.g.:
     ```
     {{from_name}} just posted a new poem for you: "{{poem_title}}".

     Go read it: [add your site's link here once it's live]
     ```
   - Save it and note the **Template ID**.
4. **Account → General** — copy your **Public Key**.
5. Put the **Public Key**, **Service ID**, and **Template ID** into `js/config.js`, in the `emailjsConfig` block.

## 3. Fill in `js/config.js`

Open `js/config.js` and paste in the values from steps 1 and 2. Save it.
That's the only file you need to touch.

## 4. Put it online — GitHub Pages (free, works entirely from your phone)

All the files sit flat in this folder on purpose — no subfolders — so uploading
from a phone's file picker (which doesn't preserve folder structure) still works.

**On your phone (Android or iOS), before you start:** unzip the file you downloaded.
- **Android:** open the **Files** app, tap the `.zip`, tap **Extract**.
- **iPhone:** open the **Files** app, tap the `.zip` — it extracts into a folder automatically.

You should end up with a folder containing 8 files: `index.html`, `style.css`,
`app.js`, `config.js`, `manifest.json`, `icon.png`, `firestore.rules`, `README.md`.

**Then, in your phone's browser (Chrome or Safari):**

1. Go to [github.com](https://github.com) and sign in (or make a free account).
2. Tap the **+** in the top right → **New repository**. Name it `ink-between-us`, keep it **Public**, tap **Create repository**.
3. On the new repo's page, tap **Add file → Upload files**.
4. Tap **choose your files**, then in the file picker go to the extracted folder and select all 8 files at once (tap "Select" or long-press one file then tap the others).
5. Scroll down and tap **Commit changes**.
6. Go to the repo's **Settings** tab → **Pages** in the left menu (on mobile, tap the ☰ menu first if you don't see the sidebar).
7. Under **Build and deployment → Source**, choose **Deploy from a branch**. Set **Branch** to `main` and folder to `/ (root)`, then **Save**.
8. Wait about a minute, then revisit that Pages settings screen — GitHub shows your live link at the top, something like:
   ```
   https://your-username.github.io/ink-between-us/
   ```

That link is the site. Send it to her. On both your phones, open it and use
**Share → Add to Home Screen** (iPhone) or the browser menu → **Add to Home
screen** (Android) — it'll sit on the home screen with its own icon and open
full-screen like a normal app, no browser bar.

**On a computer**, the exact same link works in any browser — nothing extra to do.

Any time you want to change a file later, go back to the repo, tap the file,
tap the pencil (edit) icon, make your change, and commit — GitHub Pages
redeploys automatically within a minute or two.

## 5. Both of you sign up

Open the live link, go to **Start writing**, and each pick your name (Bea or
Abegail), your email, a password, and your partner's email — that's what
links you as each other's lover for the notification email. Do this once each.

After that: write, save drafts, publish when a poem is ready, and the other
person gets an email the moment you do.

---

### How it's organized

- `index.html` — the whole page (login screen + the app)
- `style.css` — styling
- `config.js` — **the file you edit** — your Firebase + EmailJS keys
- `app.js` — the app's logic (auth, saving/loading poems, the slider, the notification email)
- `manifest.json` + `icon.png` — let the site be added to a phone home screen as an app icon
- `firestore.rules` — database security rules: drafts are private to whoever wrote them; published poems are visible to both of you once signed in; nobody else can read or write anything

### If something needs tweaking later

- **Change your poet name later** — there's no UI for it yet; edit your document directly in the Firestore console under `users/{your uid}`.
- **More than two names** — add more `<option>` values in `index.html`'s signup form and more buttons in the slider; the rest of the logic already works off whatever name is stored.
- **Costs** — Firebase's free tier and EmailJS's free tier (200 emails/month) are both comfortably enough for two people trading poems.
