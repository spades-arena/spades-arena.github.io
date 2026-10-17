# Spades Royale (by Hadzz) — Android Phone & Tablet UI/UX Architecture & Handoff Spec for Claude

This document specifies the Android Phone & Tablet UI/UX architecture, screen layouts, touch/thumb-zone ergonomics, DOM mount points, and JavaScript adapter contracts so Claude can connect real online multiplayer and friend services while preserving the native Android app experience.

---

## 1. Android Phone & Tablet Native App Shell (`index.html` & `styles.css`)

**Spades by Hadzz** is designed specifically for **Android Phones (Portrait)** and **Android Tablets (Landscape/Portrait)** (playable in Chrome for Android, Android WebView, Capacitor, or Cordova, with an on-screen device frame switcher when previewing on desktop/Claude):

- **Full-Bleed Non-Scrolling App Viewport (`100dvh`, `overflow: hidden`):**
  - Uses `touch-action: manipulation`, `overscroll-behavior: none`, `-webkit-user-select: none`, and `env(safe-area-inset-top / bottom)` for Android status bar and gesture bar clearance.
- **Android Viewport Simulator Bar (`.device-preview-bar`):**
  - When previewed on a desktop monitor (>900px), provides one-tap switching between:
    - `📱 Android Phone` (`data-device-frame="phone"` — 420×880dp Pixel / Galaxy S portrait geometry)
    - `📟 Android Tablet` (`data-device-frame="tablet"` — 1040×730dp Galaxy Tab landscape geometry)
    - `⛶ Full Screen` (`data-device-frame="full"`)
  - Automatically hides on real Android phones and tablets so the app fills `100%` of the device screen.
- **Android Top App Bar (`#app-topbar`) & Bottom Thumb Navigation (`#android-bottom-nav`):**
  - Top bar displays the app title, Coin balance pill (`🪙 60`), active AI difficulty & target score pill, and player avatar.
  - Bottom 6-tab bar (`Home`, `Table`, `Lobby`, `Friends`, `Profile`, `Settings`) keeps all primary navigation within thumb reach.
- **Android Haptic Feedback (`SpadesHadzz.audio.vibrate`):**
  - Uses `navigator.vibrate(...)` for tactile card play (`14ms`), trick wins (`[18, 30, 25]`), Spades broken (`[25, 35, 45]`), and illegal play alerts (`[45, 40, 65]`), respecting the user's Sound/Haptics toggle.
- **Android WebApp Manifest ([`manifest.json`](./manifest.json)):**
  - Configured with `"display": "standalone"` and `"theme_color": "#06170e"` for Android home-screen installation or APK WebView wrapping.

---

## 2. Android Game Table & Thumb-Zone Card Ergonomics (`#screen-game`)

The entire 4-seat Spades table fits onto a single Android phone or tablet screen with **zero vertical scrolling**:

1. **Slim Points-Only Top Bar (`.top-scoreboard-panel`):**
   - Left `.blue-box`: Team Blue (`YOU`) score, combined `tricks/bid`, and `bags`.
   - Center `.table-center-meta`: Round + Spades status badge (`R1 · ♠🔒` / `♠🔥`), Trick `1..13`, and AI tier.
   - Right `.red-box`: Team Red (`FOE`) score, combined `tricks/bid`, and `bags`.
   - When the human player is bidding, a compact single-row `0 (Nil) – 10` bid selector strip (`.top-bid-selector`) appears inside this top panel and auto-hides once the bid is placed.
   - **No player names or extra status lines** sit under the points bar so maximum vertical height is reserved for the felt table and playing cards.
2. **Compass Felt Arena (`.felt-arena`):**
   - CSS Grid positioning `North` (Partner), `West`, `East`, and `South` (You) with minimal outer-rim `tricks/bid` tags (`.table-edge-seat`: `S 0/3`, `W 0/2`, `N 0/3`, `E 0/4`) around a spacious `.trick-mat` (`275×210px`).
   - Active turn seat highlights with `.active-turn` gold glow.
   - Quick-chat and emoji speech bubbles (`.chat-bubble`) pop up directly above the speaking seat's rim tag.
3. **Hadzz Signature Deck & Overlapping Horizontal Card Fan (`.player-hand-row`):**
   - Custom modern SVG playing cards (`SpadesHadzz.engine.renderModernCardInnerHTML`) with dual-tone gradients, watermark lattice, gold corner frames, and crowned court cards (`J, Q, K, A`).
   - All 13 cards sit in a single horizontal overlapping fan (`64×94px` on phone, `74×106px` on tablet) in the bottom thumb zone.
   - Legal cards on your turn lift upward (`transform: translateY(-9px)`) with a bright emerald border (`.card-legal-ready`), while illegal cards dim (`.card-illegal-dim`).
4. **Bottom-Sheet Quick Chat & Emoji Drawer (`.quick-chat-drawer`):**
   - Opens as a floating sheet above the hand dock with 5 preset messages (`Well played!`, `Good game!`, `Good move!`, `Good luck!`, `You’re playing well!`) and 5 emoji reactions (`😢`, `😊`, `😂`, `😔`, `😎`).

---

## 3. Folder Structure & Bundling (`bundle.py`)

```text
Spades/
├── index.html               # Standalone self-contained build (styles.css + js/*.js bundled inline)
├── styles.css               # Modular CSS source
├── bundle.py                # Run `python3 bundle.py` after editing styles.css or js/*.js to update index.html
├── manifest.json            # Android WebApp manifest
├── README.md                # Overview & testing instructions
├── CLAUDE_UI_UX_HANDOFF.md  # This specification
└── js/
    ├── avatars.js           # 10 Free + 5 Legendary SVG avatars (60, 70, 80, 90, 100 coins)
    ├── audio.js             # Web Audio synthesizer + Android navigator.vibrate haptics
    ├── store.js             # LocalStorage profile, coins, avatar shop, anti-duplicate reward ledger
    ├── engine.js            # Cryptographic Fisher-Yates + cut + riffle shuffle, 4-seat dealer, rules & SVG card renderer
    ├── bot.js               # Fair 5-level Bot AI (Beginner, Easy, Medium, Hard, Impossible)
    ├── network-adapter.js   # <-- CLAUDE BACKEND ENTRY POINT (Multiplayer lobbies, Friends, Quick-Chat)
    └── app.js               # Main screen controller & DOM renderer
```

---

## 4. Live Multiplayer, Accounts & Friends (Connected)

The backend is live: run `node server/server.js` (see README §3). `SpadesHadzz.networkAdapter` talks to it over one WebSocket (`/ws`, JSON messages `{ t: type, ... }`).

- **Login (`#screen-login`):** `login(username, password)`, `register(username, password)`, `logout()`, `renameAccount(name)`. Lobby & Friends require a login; guests can play offline.
- **Lobby (`#screen-multiplayer`):** `setHumanCountMode(2|4)`, `createRoom()`, `joinRoomByCode(code)`, `selectTeam('blue'|'red')`, `toggleReady()`, `startOnlineMatch()`, `leaveRoom()`, `respondToInvite(id, accept)`. Error banners (`.state-alert`): `invalid_code`, `full_room`, `unavailable_friend`, `taken_username` (+ `team_full`, `in_progress`, `bad_credentials`, …).
- **Match (`#screen-game`):** the adapter fires `on('match', snapshot)`. `app.applyOnlineSnapshot` rotates it so the local player is view seat 0 (bottom) and reuses `renderGameScreen()` unchanged. Actions: `sendBid(n)`, `playCard(id)`, `requestNextRound()`. Bots and timers run on the server only.
- **Friends (`#screen-friends`):** `searchUsername(q)`, `sendFriendRequest(id)`, `respondFriendRequest(id, accept)`, `removeFriend(id)`, `inviteFriendToLobby(id)`; presence arrives via `social:state`.
- **Quick chat:** `sendTableReaction({kind, id})` broadcasts; incoming `on('chat')` shows `.chat-bubble` on the sender's seat.
