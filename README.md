# Spades Royale: Offline Multiplayer

*Play. Win. Rule.* — made by Hadzz.

A responsive HTML/CSS/JavaScript web application featuring a complete, playable 4-seat offline Spades game with 5 fair AI difficulty levels, Nil and bag scoring, local profile/coin/avatar progression, and complete frontend screens & state contracts ready for Claude to connect online multiplayer and friend services.

---

## 1. How to Run the App

### Option A: Open Directly in Browser (Zero Setup)
Because all scripts use the universal `window.SpadesHadzz` namespace (avoiding `file://` CORS restrictions), you can simply double-click [`index.html`](./index.html) in Finder/Explorer or open it in any desktop or mobile browser.

### Option B: Run a Local Static Server
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

---

## 2. Project File Structure

- [`index.html`](./index.html) — App shell containing the Loading Screen ("Spades by Hadzz"), persistent top HUD bar, Main Menu, Offline Game Table, Multiplayer Lobby, Friends & Directory screen, Profile & Avatar Shop, Settings, and Rules / Help.
- [`styles.css`](./styles.css) — Spade-green casino felt aesthetic, playing card typography, responsive desktop/mobile layout, animations, and `.reduced-motion` accessibility mode.
- [`js/avatars.js`](./js/avatars.js) — 10 Free Avatars and 5 Locked Legendary Avatars (priced at `60`, `70`, `80`, `90`, and `100` coins) rendered via self-contained procedural SVG illustrations.
- [`js/audio.js`](./js/audio.js) — Procedural Web Audio API sound effects (card deal, card play, trick win, Spades broken, illegal play buzzer, coin reward chime) and ambient table lounge music toggle.
- [`js/store.js`](./js/store.js) — Local persistence (`localStorage`) for username, starting 60-coin balance, avatar ownership, anti-duplicate round/match reward ledger (`rewardedIds`), and settings.
- [`js/engine.js`](./js/engine.js) — 4-seat Spades rules engine: 52-card deal (13 cards per player), 0–10 bidding, suit-following enforcement, trump Spade breaking rules, trick winner resolution, Nil (+100/-100) scoring, overtrick bags, and 10-bag (-100) penalties.
- [`js/bot.js`](./js/bot.js) — Fair 5-level AI (`Beginner`, `Easy`, `Medium`, `Hard`, `Impossible`). Bots receive **only** their own hand, bids, and public played-card history—never hidden hands or undealt cards.
- [`js/network-adapter.js`](./js/network-adapter.js) — Live WebSocket client: accounts/login sessions, lobbies, server-synced matches, friends, presence, invites & quick chat.
- [`server/`](./server/) — Node.js multiplayer server (`server.js` protocol & directory, `match.js` authoritative game, `ws-lite.js` WebSocket layer).
- [`js/app.js`](./js/app.js) — Main UI controller coordinating screens, offline match loop, preset quick chat & emoji reactions, profile shop, and settings.

---

## 3. Online Multiplayer Server (Live)

Online play, accounts, friends, presence, invites and quick chat run on a small **zero-dependency Node.js server** in [`server/`](./server/) (Node 18+).

```bash
node server/server.js          # → http://localhost:8787  (WebSocket: ws://<host>:8787/ws)
```

- Open `http://localhost:8787` — the server also hosts the app, so the client connects to it automatically.
- **Android phones/tablets on the same Wi-Fi:** open `http://<your-computer-LAN-IP>:8787`. If the app is loaded some other way (file://, APK WebView), tap **⚙ Server** on the Login/Lobby screen and enter `<LAN-IP>:8787` or `wss://your-domain/ws`.
- **Public internet:** deploy `server/` to any Node host (Render, Fly.io, Railway, a VPS) behind HTTPS so traffic uses `wss://` — passwords are sent over the socket, so always use TLS outside your own network.
- Env vars: `PORT` (8787), `HOST` (0.0.0.0), `DATA_DIR` (default `server/data/`), `SPADES_MSG_LIMIT` (messages per 5 s per socket, default 120).
- Player accounts persist in `server/data/db.json` (passwords hashed with scrypt + salt; login sessions stored only as SHA-256 hashes).

### What the server does
| Area | Behaviour |
|---|---|
| **Accounts** | Login screen with *Log In / Create Account*. Usernames are unique (case-insensitive) and owned by one account → `taken_username`. Sessions survive app restarts; renaming in Profile is checked by the server. 8 wrong passwords lock the account for 5 min. Guests can still play offline. |
| **Lobbies** | `2`-Human (+2 AI bots) or `4`-Human rooms only. Team Blue = South & North, Team Red = West & East (partners opposite). Room codes like `HDZ-7K2P`. Errors: `invalid_code`, `full_room`, `team_full`, `in_progress`. Match auto-starts when all humans are Ready (host can also tap ▶ Start). |
| **Matches** | Server-authoritative ([`server/match.js`](./server/match.js)) using the same `js/engine.js` (crypto shuffle, deal, rules, scoring) and `js/bot.js`. A fresh 52-card shuffle every round; each player receives **only their own 13 cards**. Every bid/card is validated server-side. Bots fill empty seats and cover disconnected players until they reconnect. |
| **Rewards** | Round/match winners are decided by the server; each client claims `+10` / `+50` coins with unique round/match keys (`rewardedIds`) so payouts never duplicate. |
| **Friends** | Username search, requests (accept/decline/cancel/remove), live presence (`online`, `in_match`, `offline`), one-tap lobby invites (auto-creates a room; `unavailable_friend` when busy/offline). |
| **Resume / New Game** | Offline games are saved on the device: leaving or closing the app shows a *Continue where you left off* card on Home, and *Play Offline* asks **Resume** or **New Game** (always a fresh shuffle). Leaving an online table keeps your seat (a bot covers it) — tap **▶ Resume** on Home/Lobby, or **Quit** to give the seat to a bot permanently. If every human leaves, the online match pauses until someone returns. Logging out also keeps your seat. |
| **Pass & Play** | Offline multiplayer: 2 (partners or rivals, + 2 bots) or 4 people share one phone/tablet with no internet. Each player's cards stay hidden until they tap *Show my cards*. Runs the same match engine as the server (`js/match.js`); saved on the device with Resume / 🗑 Delete. |
| **Leave notices** | When a player disconnects, steps away or quits, a banner appears on the table ("⚠️ Maya left due to technical problems…") — for their teammate always, and for everyone in 4-player games. |
| **Game Speed** | Settings → Relaxed / Normal / Fast controls bot think-time and how long finished tricks stay on the table (offline, Pass & Play, and online rooms you host). |
| **Turn timer** | 45 s per human turn online; when it runs out the server makes one move for you (⏱ countdown shown in your hand bar). |
| **Quick chat** | The 5 preset phrases and 5 emojis are broadcast to every seat and pop up as `.chat-bubble` on the sender's seat. |

On the client, [`js/network-adapter.js`](./js/network-adapter.js) handles the socket (auto-reconnect), and [`js/app.js`](./js/app.js) renders online matches with the same Android table. The view is rotated so **you are always at the bottom** and your team is always the left score pill.

After editing `styles.css` or `js/*.js`, run `python3 bundle.py` to rebuild the standalone `index.html`.

## 4. Tests

```bash
node tests/shuffle.test.mjs      # 20,000 deals: all unique, all fair (no dependencies)
node tests/server.e2e.mjs        # 60 checks: accounts, lobbies, full matches, friends, resume (Node 22+)
cd tests && npm install && node ui.e2e.mjs   # 28 checks in real Chrome (two players + a guest)
```


---

## Going live for free (download site + Android / Windows / Mac apps + login server)

Everything builds and runs on free servers, not your computer:

1. **GitHub (free).** Push this folder to a new public repo. In **Settings → Pages**, set *Source* to **GitHub Actions**.
   Every push to `main` runs [`.github/workflows/release.yml`](.github/workflows/release.yml) on GitHub's servers, which:
   - builds the **Android APK** ([`android/`](android/)), the **Windows installer** and the **Mac .dmg** ([`desktop/`](desktop/));
   - publishes them as a GitHub Release;
   - deploys the download site ([`site/index.html`](site/index.html)) to `https://<you>.github.io/<repo>/`, with the browser version at `/play/`.
2. **Render (free).** Go to *New → Blueprint* and pick the repo ([`render.yaml`](render.yaml)). This runs `server/server.js` for logins, friends, invites and gifts.
3. **Upstash (free, optional but recommended).** Create a Redis database. Paste its REST URL and token into the Render service's environment so accounts survive the free server sleeping.
4. **Connect the apps to the server.** In GitHub → *Settings → Secrets and variables → Actions → Variables*, add `SPADES_SERVER_URL` = `wss://<your-render-app>.onrender.com/ws`. Then re-run the workflow.

Rooms and matches stay peer-to-peer (the host's phone), so the free server only handles accounts and friends.
